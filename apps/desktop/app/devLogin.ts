import type { Core } from '@hey-postie/core';
import { invoke } from '@tauri-apps/api/core';

/**
 * `pnpm desktop:dev:alice` (see `src-tauri/src/dev_login.rs`): signs in with the test account the
 * dev run names, without the form and without the keychain (`remember: false`). Nothing happens in
 * a release build or when the run names no account.
 */
export async function signInForDev(core: Core): Promise<void> {
  const login = await invoke<[string, string] | null>('dev_login');
  if (!login || core.accounts.current()) return;
  const [jid, password] = login;
  await core.accounts
    .signIn({ jid, password, remember: false })
    .catch((error: unknown) =>
      console.warn('[dev] sign-in failed: is the test server running?', error),
    );
}
