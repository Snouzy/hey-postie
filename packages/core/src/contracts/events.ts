import type { Account, Chat, Contact, Message } from './types';

export interface CoreEvents {
  'account.changed': Account;
  'message.received': Message;
  'message.updated': Message;
  'chat.updated': Chat;
  'contact.updated': Contact;
}

export interface EventBus {
  /** Subscribes and returns the function that unsubscribes. */
  on<K extends keyof CoreEvents>(event: K, handler: (payload: CoreEvents[K]) => void): () => void;
  emit<K extends keyof CoreEvents>(event: K, payload: CoreEvents[K]): void;
}
