import type { DomainError } from '../contracts/errors';
import type { XmppRepository } from '../contracts/repositories';
import type { AccountPresence, AccountState } from '../contracts/types';

type ConnectInput = Parameters<XmppRepository['connect']>[0];
type StateHandler = (state: AccountState, error?: DomainError) => void;
type AvatarHandler = (avatarUrl: string | undefined) => void;

/**
 * Records what the service asks for. On failure it only throws: the service owns the error state,
 * so the 'account.changed' sequence stays `connecting` then `error`.
 */
export class FakeXmpp implements XmppRepository {
  lastConnect: ConnectInput | null = null;
  connected = false;
  failWith: DomainError | null = null;
  /** Every presence sent, in order. */
  readonly presences: AccountPresence[] = [];
  private readonly handlers = new Set<StateHandler>();
  private readonly avatarHandlers = new Set<AvatarHandler>();

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

  async setPresence(presence: AccountPresence): Promise<void> {
    this.presences.push(presence);
  }

  onAvatarChange(handler: AvatarHandler): () => void {
    this.avatarHandlers.add(handler);
    return () => this.avatarHandlers.delete(handler);
  }

  /** Simulates a state change coming from the connection (a reconnection, for instance). */
  setState(state: AccountState): void {
    this.notify(state);
  }

  /** Simulates the server publishing (or removing) this account's avatar. */
  setAvatar(avatarUrl: string | undefined): void {
    for (const handler of this.avatarHandlers) handler(avatarUrl);
  }

  private notify(state: AccountState): void {
    for (const handler of this.handlers) handler(state);
  }
}
