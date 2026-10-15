import type { DomainError } from '../contracts/errors';
import type { XmppRepository } from '../contracts/repositories';
import type { AccountState } from '../contracts/types';

type ConnectInput = Parameters<XmppRepository['connect']>[0];
type StateHandler = (state: AccountState, error?: DomainError) => void;

/**
 * Records what the service asks for. On failure it only throws: the service owns the error state,
 * so the 'account.changed' sequence stays `connecting` then `error`.
 */
export class FakeXmpp implements XmppRepository {
  lastConnect: ConnectInput | null = null;
  connected = false;
  failWith: DomainError | null = null;
  private readonly handlers = new Set<StateHandler>();

  async connect(input: ConnectInput): Promise<void> {
    this.lastConnect = input;
    if (this.failWith) throw this.failWith;
    this.connected = true;
    this.notify('online');
  }

  /** Like the real repository: signing out of nothing is silent. */
  async disconnect(): Promise<void> {
    if (!this.connected) return;
    this.connected = false;
    this.notify('offline');
  }

  onStateChange(handler: StateHandler): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  /** Simulates a state change coming from the connection (a reconnection, for instance). */
  setState(state: AccountState): void {
    this.notify(state);
  }

  private notify(state: AccountState): void {
    for (const handler of this.handlers) handler(state);
  }
}
