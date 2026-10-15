import { DomainError, type XmppRepository } from '@hey-postie/core';

/** Placeholder until the Converse repository lands (milestone 1). */
export class NotYetXmpp implements XmppRepository {
  async connect(): Promise<void> {
    throw new DomainError('ServerUnreachable', 'ServerUnreachable: no XMPP engine yet');
  }

  async disconnect(): Promise<void> {}

  onStateChange(): () => void {
    return () => {};
  }
}
