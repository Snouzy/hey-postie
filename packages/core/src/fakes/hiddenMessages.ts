import type { HiddenMessagesRepository } from '../contracts/repositories';

/** In-memory "delete for me" list, per account. */
export class FakeHiddenMessages implements HiddenMessagesRepository {
  private readonly byAccount = new Map<string, string[]>();

  async list(account: string): Promise<string[]> {
    return [...(this.byAccount.get(account) ?? [])];
  }

  async add(account: string, messageId: string): Promise<void> {
    const ids = this.byAccount.get(account) ?? [];
    if (!ids.includes(messageId)) this.byAccount.set(account, [...ids, messageId]);
  }
}
