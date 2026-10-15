import { type Core, DomainError } from '@hey-postie/core';
import { invoke } from '@tauri-apps/api/core';
import { emit } from '@tauri-apps/api/event';

/**
 * The end-to-end half of `--smoke` (see `src-tauri/src/smoke.rs`): when the Rust side holds
 * credentials, sign in for real and report `smoke-online` or `smoke-failed` with the error code.
 * The `smoke-log` lines carry error names, codes and messages, never message or stanza contents.
 */
export async function runSmokeLogin(core: Core): Promise<void> {
  const login = await invoke<[string, string] | null>('smoke_login');
  if (!login) return;
  forwardErrors();
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
