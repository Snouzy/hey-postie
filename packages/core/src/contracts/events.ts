import type { Account, Chat, Contact, Message, Room, RoomMember } from './types';

export interface CoreEvents {
  'account.changed': Account;
  'message.received': Message;
  'message.updated': Message;
  'chat.updated': Chat;
  'contact.updated': Contact;
  'room.updated': Room;
  'room.members': { jid: string; members: RoomMember[] };
  /** The UI asks to show a chat (a click on a notification, an `xmpp:` link). */
  'chat.requested': { chatId: string };
}

export interface EventBus {
  /** Subscribes and returns the function that unsubscribes. */
  on<K extends keyof CoreEvents>(event: K, handler: (payload: CoreEvents[K]) => void): () => void;
  emit<K extends keyof CoreEvents>(event: K, payload: CoreEvents[K]): void;
}
