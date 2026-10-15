import type { DomainError } from './errors';
import type { AccountState } from './types';

export interface KeychainRepository {
  get(jid: string): Promise<string | null>;
  set(jid: string, password: string): Promise<void>;
  delete(jid: string): Promise<void>;
}

export interface TransportRepository {
  websocketUrlFor(domain: string): Promise<string>;
}

export interface XmppRepository {
  connect(input: { jid: string; password: string; websocketUrl: string }): Promise<void>;
  disconnect(): Promise<void>;
  onStateChange(handler: (state: AccountState, error?: DomainError) => void): () => void;
}

export interface Notifier {
  show(input: { title: string; body: string; chatId: string }): Promise<void>;
}
