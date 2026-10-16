import { type Core, DomainError } from '@hey-postie/core';
import { invoke } from '@tauri-apps/api/core';
import { emit, listen } from '@tauri-apps/api/event';

/**
 * The end-to-end half of `--smoke` (see `src-tauri/src/smoke.rs`): when the Rust side holds
 * credentials, sign in for real and report `smoke-online` or `smoke-failed` with the error code.
 * The `smoke-log` lines carry error names, codes and messages, never message or stanza contents.
 *
 * The scripted scenario (`scripts/smoke-scenario.mjs`) then drives the app through `smoke-command`
 * events and watches `smoke-step` events: step names and identifiers only, never a body.
 */
export async function runSmokeLogin(core: Core): Promise<void> {
  const login = await invoke<[string, string] | null>('smoke_login');
  if (!login) return;
  forwardErrors();
  reportSteps(core);
  await listen<string>('smoke-command', (event) => void runCommand(core, event.payload));
  const [jid, password] = login;
  try {
    await core.accounts.signIn({ jid, password, remember: false });
    const state = core.accounts.current()?.state;
    if (state !== 'online') throw new DomainError('Unknown', `Unknown: state is ${state}`);
    await emit('smoke-online');
  } catch (error) {
    await emit('smoke-log', describe(error));
    await emit('smoke-failed', error instanceof DomainError ? error.code : 'Unknown');
  }
}

type Command =
  | { command: 'open'; jid: string }
  | { command: 'send'; chatId: string; body: string }
  | { command: 'join'; jid: string; nick: string }
  | { command: 'leave'; jid: string };

/** One command per line from the driver; the answer is a `done` or `failed` step with its name. */
async function runCommand(core: Core, line: string): Promise<void> {
  let command: Command | undefined;
  try {
    command = JSON.parse(line) as Command;
    switch (command.command) {
      case 'open':
        await core.chats.open(command.jid);
        break;
      case 'send':
        await core.chats.send(command.chatId, command.body);
        break;
      case 'join':
        await core.rooms.join({ jid: command.jid, nick: command.nick });
        break;
      case 'leave':
        await core.rooms.leave(command.jid);
        break;
    }
    await step({ step: 'done', command: command.command });
  } catch (error) {
    await step({ step: 'failed', command: command?.command ?? 'unknown', error: describe(error) });
  }
}

function reportSteps(core: Core): void {
  core.events.on('message.received', (message) => {
    const { chatId, id, direction } = message;
    void step({ step: 'message-received', chatId, id, direction, fromNick: message.fromNick });
  });
  core.events.on(
    'account.changed',
    (account) => void step({ step: 'account', state: account.state }),
  );
}

/** Serialized as JSON by Tauri; Rust prints it as is (`smoke: step {...}`). */
function step(payload: Record<string, string | undefined>): Promise<void> {
  return emit('smoke-step', payload);
}

function forwardErrors(): void {
  window.addEventListener('error', (event) => void emit('smoke-log', describe(event.error)));
  window.addEventListener(
    'unhandledrejection',
    (event) => void emit('smoke-log', `unhandled rejection: ${describe(event.reason)}`),
  );
}

/** `Name: message`, with the chain of causes. */
function describe(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  const line = `${error.name}: ${error.message}`;
  return error.cause === undefined ? line : `${line} <- ${describe(error.cause)}`;
}
