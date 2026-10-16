// `pnpm desktop:dev`: `tauri dev` labelled with the worktree it runs from, so the author always
// knows which session's code the window shows. Many sessions work in parallel, one worktree each
// (AGENTS.md, section 7): the window title, a ribbon in the interface and the terminal all say
// "<worktree> · <branch>", and each worktree gets its own Vite port, so two dev servers never clash.

import { execFileSync, spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const DESKTOP = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BASE_PORT = 1420;

const git = (...args) => execFileSync('git', args, { cwd: DESKTOP, encoding: 'utf8' }).trim();

/** The worktree's folder name under `.claude/worktrees/`, or `main checkout` for the repository itself. */
function worktreeName() {
  const top = git('rev-parse', '--show-toplevel');
  return top.includes('/.claude/worktrees/') ? basename(top) : 'main checkout';
}

function branchName() {
  return git('branch', '--show-current') || `detached ${git('rev-parse', '--short', 'HEAD')}`;
}

/** The same port for the same worktree on every run, moved on while it is taken. */
async function portFor(name) {
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) % 500;
  for (let port = BASE_PORT + hash; port < BASE_PORT + 1000; port += 1) {
    if (await isFree(port)) return port;
  }
  throw new Error('no free port for the dev server');
}

function isFree(port) {
  return new Promise((done) => {
    const server = createServer()
      .once('error', () => done(false))
      .once('listening', () => server.close(() => done(true)))
      .listen(port, 'localhost');
  });
}

/** True while the installed app runs: the dev window would then hand over to it and quit. */
function installedAppRuns() {
  try {
    execFileSync('pgrep', ['-f', '/Applications/Hey Postie.app/Contents/MacOS/'], {
      stdio: 'ignore',
    });
    return true;
  } catch {
    return false;
  }
}

const name = worktreeName();
const label = `${name} · ${branchName()}`;
const port = await portFor(name);
const conf = JSON.parse(readFileSync(join(DESKTOP, 'src-tauri/tauri.conf.json'), 'utf8'));
const windows = conf.app.windows.map((window) => ({ ...window, title: `Hey Postie · ${label}` }));
const override = {
  build: {
    devUrl: `http://localhost:${port}`,
    beforeDevCommand: `pnpm app:dev --port ${port} --strictPort`,
  },
  app: { windows },
};

console.log(`\n  Hey Postie dev: ${label}, http://localhost:${port}\n`);
if (installedAppRuns()) {
  console.log(
    '  The installed Hey Postie is running: quit it first, or this window hands over to it and quits\n' +
      '  (one instance at a time, tauri-plugin-single-instance).\n',
  );
}

const child = spawn('pnpm', ['tauri', 'dev', '--config', JSON.stringify(override)], {
  cwd: DESKTOP,
  stdio: 'inherit',
  env: { ...process.env, VITE_DEV_LABEL: label },
});
child.on('exit', (code) => process.exit(code ?? 0));
