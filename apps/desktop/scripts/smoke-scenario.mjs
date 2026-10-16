// End-to-end scenario in the real app: `pnpm desktop:smoke:scenario`. Alice is the Tauri app,
// started with `--smoke` in driven mode (src-tauri/src/smoke.rs, app/smoke.ts); bob is the
// hand-written WebSocket client of the contract tests (packages/core/.../test-support/bobClient.ts).
// Both talk to the local Prosody of tools/xmpp-server. The run exits 0 when every step passed,
// 1 with the name of the failing step otherwise, and leaves the machine as it found it.
//
// What the driver prints: step names, JIDs and message ids. Never a message body.

import { execFileSync, spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const APP = join(ROOT, 'apps/desktop/src-tauri/target/debug/hey-postie');
// Another checkout's server can be used (the built Prosody is git-ignored, so one per machine).
const SERVER_DIR = process.env.HEY_POSTIE_XMPP_SERVER_DIR ?? join(ROOT, 'tools/xmpp-server');
const SERVER_URL = 'wss://localhost:5281/xmpp-websocket';
const ALICE = 'alice@localhost';
const BOB = 'bob@localhost';
const RUN = Date.now().toString(36);
const HALL = `scenario-${RUN}@rooms.localhost`;
const STEP_TIMEOUT = 20_000;
const LOGIN_TIMEOUT = 40_000;
const RECONNECT_TIMEOUT = 60_000;

const startedAt = Date.now();
const log = (line) => console.log(`scenario: ${line}`);
const seconds = () => ((Date.now() - startedAt) / 1000).toFixed(1);

let startedServer = false;
let app = null;
let appExit = null;
const appSteps = [];
const stepWaiters = new Set();
let bob = null;
let bobClient = null;

try {
  await step('server', ensureServer);
  await step('app', launchApp);
  await step('sign-in', () =>
    waitForStep((s) => s.step === 'account' && s.state === 'online', LOGIN_TIMEOUT),
  );
  await step('bob', connectBobClient);
  await step('direct bob->alice', () => directMessageToAlice('1'));
  await step('direct alice->bob', () => directMessageToBob('2'));
  await step('room join', joinRoom);
  await step('room bob->alice', roomMessageToAlice);
  await step('room alice->bob', roomMessageToBob);
  await step('reconnect', restartServerAndReconnect);
  await step('direct bob->alice after reconnect', () => directMessageToAlice('3'));
  await step('direct alice->bob after reconnect', () => directMessageToBob('4'));
  await step('room leave', () => command({ command: 'leave', jid: HALL }));
  log(`PASSED in ${seconds()} s`);
  await cleanup();
  process.exit(0);
} catch (error) {
  console.error(`scenario: FAILED at step "${error.step ?? '?'}" after ${seconds()} s`);
  console.error(`scenario: ${error.message}`);
  await cleanup();
  process.exit(1);
}

async function step(name, run) {
  log(`step ${name}`);
  try {
    await run();
  } catch (error) {
    error.step = name;
    throw error;
  }
  log(`ok   ${name}`);
}

// --- The server ----------------------------------------------------------------------------

function serverScript(name, ...args) {
  return execFileSync('bash', [join(SERVER_DIR, name), ...args], { encoding: 'utf8' });
}

/** The pid of the Prosody started from SERVER_DIR, when it is alive. */
function ownServerPid() {
  const pidFile = join(SERVER_DIR, 'data/prosody.pid');
  if (!existsSync(pidFile)) return null;
  const pid = Number(readFileSync(pidFile, 'utf8').trim());
  try {
    process.kill(pid, 0);
    return pid;
  } catch {
    return null;
  }
}

/** Whoever listens on the client port: Prosody fails to bind quietly when another one does. */
function listeningPid() {
  try {
    const out = execFileSync('lsof', ['-nP', '-t', '-iTCP:5222', '-sTCP:LISTEN'], {
      encoding: 'utf8',
    });
    return Number(out.trim().split('\n')[0]) || null;
  } catch {
    return null;
  }
}

async function untilServer(listening, what) {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    if ((listeningPid() !== null) === listening) return;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`Prosody did not ${what} within 10 s`);
}

async function startServer() {
  serverScript('start.sh', '-d');
  await untilServer(true, 'start');
}

async function stopServer() {
  serverScript('stop.sh');
  await untilServer(false, 'stop');
}

async function ensureServer() {
  if (!existsSync(join(SERVER_DIR, 'prosody/bin/prosody'))) {
    throw new Error(`no Prosody build in ${SERVER_DIR}: run tools/xmpp-server/install.sh`);
  }
  if (!process.env.NODE_EXTRA_CA_CERTS) {
    throw new Error(
      'NODE_EXTRA_CA_CERTS must point to the mkcert root CA (the pnpm script sets it)',
    );
  }
  const listener = listeningPid();
  if (listener !== null && listener !== ownServerPid()) {
    throw new Error(
      `port 5222 is served by pid ${listener}, not by the Prosody of ${SERVER_DIR}: stop it, ` +
        'or point HEY_POSTIE_XMPP_SERVER_DIR at its tools/xmpp-server folder (the restart needs its pidfile)',
    );
  }
  if (listener === null) {
    log('starting Prosody');
    await startServer();
    startedServer = true;
  }
  log(serverScript('users.sh').trim().replace(/\n/g, ', '));
}

// --- The app (alice) -----------------------------------------------------------------------

function launchApp() {
  if (!existsSync(APP)) throw new Error(`no debug build at ${APP} (the pnpm script builds it)`);
  try {
    execFileSync('pgrep', ['-x', 'hey-postie']);
    throw new Error('another Hey Postie is running: quit it first (single instance)');
  } catch (error) {
    if (error.status === undefined) throw error;
  }
  app = spawn(APP, ['--smoke'], {
    env: {
      ...process.env,
      HEY_POSTIE_SMOKE_LOGIN: `${ALICE}:alice-pw`,
      HEY_POSTIE_SMOKE_DRIVE: '1',
    },
    stdio: ['pipe', 'inherit', 'pipe'],
  });
  app.on('exit', (code, signal) => {
    appExit = new Error(`the app exited (code ${code}, signal ${signal})`);
    for (const waiter of stepWaiters) waiter.reject(appExit);
  });
  createInterface({ input: app.stderr }).on('line', (line) => {
    console.error(`app | ${line}`);
    if (!line.startsWith('smoke: step ')) return;
    const payload = JSON.parse(line.slice('smoke: step '.length));
    appSteps.push(payload);
    for (const waiter of stepWaiters) waiter.check();
  });
}

/** Takes the first matching step, already reported or to come. */
function waitForStep(predicate, timeoutMs = STEP_TIMEOUT) {
  return new Promise((resolve, reject) => {
    if (appExit) return reject(appExit);
    const waiter = {
      reject,
      check: () => {
        const index = appSteps.findIndex(predicate);
        if (index < 0) return false;
        clearTimeout(timer);
        stepWaiters.delete(waiter);
        resolve(appSteps.splice(index, 1)[0]);
        return true;
      },
    };
    const timer = setTimeout(() => {
      stepWaiters.delete(waiter);
      reject(new Error(`the app reported no matching step within ${timeoutMs / 1000} s`));
    }, timeoutMs);
    if (!waiter.check()) stepWaiters.add(waiter);
  });
}

/** Sends one command line to the app and waits for its `done` (or throws on `failed`). */
async function command(payload) {
  app.stdin.write(`${JSON.stringify(payload)}\n`);
  const answer = await waitForStep(
    (s) => (s.step === 'done' || s.step === 'failed') && s.command === payload.command,
  );
  if (answer.step === 'failed')
    throw new Error(`the app failed "${payload.command}": ${answer.error}`);
}

/** The driver runs at the top level: helpers are function declarations, hoisted above it. */
function receivedFromBob(chatId) {
  return (s) => s.step === 'message-received' && s.direction === 'in' && s.chatId === chatId;
}

// --- Bob -----------------------------------------------------------------------------------

async function connectBobClient() {
  if (!bobClient) {
    // The client parses stanzas with the DOM; core's jsdom (its test dependency) provides it.
    const coreRequire = createRequire(join(ROOT, 'packages/core/package.json'));
    const { JSDOM } = await import(pathToFileURL(coreRequire.resolve('jsdom')));
    globalThis.DOMParser = new JSDOM('').window.DOMParser;
    bobClient = await import(
      pathToFileURL(join(ROOT, 'packages/core/src/repositories/converse/test-support/bobClient.ts'))
    );
  }
  bob = await bobClient.connectBob({
    url: SERVER_URL,
    jid: BOB,
    password: 'bob-pw',
    resource: `scenario-${RUN}`,
  });
}

// --- Steps ---------------------------------------------------------------------------------

async function directMessageToAlice(n) {
  bob.send(
    `<message to="${ALICE}" type="chat" id="${RUN}-${n}"><body>Hello Alice (${RUN}-${n})</body></message>`,
  );
  const received = await waitForStep(receivedFromBob(BOB));
  log(`the app received message ${received.id} in chat ${received.chatId}`);
}

async function directMessageToBob(n) {
  bob.forget();
  await command({ command: 'open', jid: BOB });
  await command({ command: 'send', chatId: BOB, body: `Hello Bob (${RUN}-${n})` });
  const stanza = await bob.waitFor(bobClient.isChatMessageFrom(ALICE), STEP_TIMEOUT);
  log(`bob received message ${stanza.getAttribute('id')} from ${stanza.getAttribute('from')}`);
}

async function joinRoom() {
  await command({ command: 'join', jid: HALL, nick: 'alice' });
  await bob.joinRoom(HALL, 'bob');
  log(`alice and bob are in ${HALL}`);
}

async function roomMessageToAlice() {
  bob.send(
    `<message to="${HALL}" type="groupchat" id="${RUN}-r1"><body>Hello room (${RUN})</body></message>`,
  );
  const received = await waitForStep((s) => receivedFromBob(HALL)(s) && s.fromNick === 'bob');
  log(`the app received room message ${received.id} from ${received.fromNick}`);
}

async function roomMessageToBob() {
  bob.forget();
  await command({ command: 'send', chatId: HALL, body: `Hello room from Alice (${RUN})` });
  const stanza = await bob.waitFor(
    (s) => bobClient.isGroupchatMessageFrom(HALL)(s) && s.getAttribute('from') === `${HALL}/alice`,
    STEP_TIMEOUT,
  );
  log(`bob received room message ${stanza.getAttribute('id')} from ${stanza.getAttribute('from')}`);
}

async function restartServerAndReconnect() {
  await bob.close();
  bob = null;
  appSteps.splice(0);
  log('restarting Prosody');
  await stopServer();
  await startServer();
  await waitForStep((s) => s.step === 'account' && s.state !== 'online', STEP_TIMEOUT);
  log('the app saw the drop');
  await waitForStep((s) => s.step === 'account' && s.state === 'online', RECONNECT_TIMEOUT);
  log('the app is back online');
  await connectBobClient();
}

// --- Cleanup -------------------------------------------------------------------------------

async function cleanup() {
  if (bob) {
    bob.leaveRoom(HALL, 'bob');
    await bob.close().catch(() => undefined);
  }
  if (app && app.exitCode === null) {
    app.stdin.write('quit\n');
    const exited = new Promise((resolve) => app.once('exit', resolve));
    const timer = setTimeout(() => app.kill('SIGKILL'), 5_000);
    await exited;
    clearTimeout(timer);
  }
  if (startedServer && ownServerPid() !== null) {
    log('stopping the Prosody this run started');
    await stopServer().catch((error) => log(`cannot stop Prosody: ${error.message}`));
  }
}
