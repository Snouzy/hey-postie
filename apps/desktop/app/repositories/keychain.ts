import { DomainError, type KeychainRepository } from '@hey-postie/core';
import { invoke } from '@tauri-apps/api/core';

/** Passwords through the Rust `keychain_*` commands (OS keychain). */
export class TauriKeychain implements KeychainRepository {
  async get(jid: string): Promise<string | null> {
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
  try {
    return await command();
  } catch (error) {
    if (String(error).includes('KeychainUnavailable')) {
      throw new DomainError('KeychainUnavailable', undefined, error);
    }
    throw new DomainError('Unknown', 'Unknown: keychain command failed', error);
  }
}
