import { DomainError } from '../contracts/errors';
import type { KeychainRepository } from '../contracts/repositories';

/** In-memory keychain. Set `unavailable` to behave like Linux without Secret Service. */
export class FakeKeychain implements KeychainRepository {
  unavailable = false;
  private readonly store = new Map<string, string>();

  async get(jid: string): Promise<string | null> {
    this.check();
    return this.store.get(jid) ?? null;
  }

  async set(jid: string, password: string): Promise<void> {
    this.check();
    this.store.set(jid, password);
  }

  async delete(jid: string): Promise<void> {
    this.check();
    this.store.delete(jid);
  }

  private check(): void {
    if (this.unavailable) throw new DomainError('KeychainUnavailable');
  }
}
