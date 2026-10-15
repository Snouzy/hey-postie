import { DomainError, type KeychainRepository } from '@hey-postie/core';
import { invoke } from '@tauri-apps/api/core';
import { isTauri } from '../tauri';

/**
 * Passwords through the Rust `keychain_*` commands (OS keychain). In a plain browser
 * (`pnpm app:dev`) there is no Rust side: the keychain is simply unavailable, which the accounts
 * service tolerates (the password is not kept).
 */
export class TauriKeychain implements KeychainRepository {
  async get(jid: string): Promise<string | null> {
    if (!isTauri()) return null;
    return call(() => invoke<string | null>('keychain_get', { jid }));
  }

  async set(jid: string, password: string): Promise<void> {
    await call(() => invoke<void>('keychain_set', { jid, password }));
  }

  async delete(jid: string): Promise<void> {
    await call(() => invoke<void>('keychain_delete', { jid }));
  }
}

async function call<T>(command: () => Promise<T>): Promise<T> {
  if (!isTauri()) throw new DomainError('KeychainUnavailable', 'KeychainUnavailable: not in Tauri');
  try {
    return await command();
  } catch (error) {
    if (String(error).includes('KeychainUnavailable')) {
      throw new DomainError('KeychainUnavailable', undefined, error);
    }
    throw new DomainError('Unknown', 'Unknown: keychain command failed', error);
  }
}
