import type { AssistantSettings, SendRequest } from './services';
import type {
  Account,
  Chat,
  Contact,
  ContactRequest,
  Device,
  Message,
  Room,
  RoomMember,
} from './types';

export interface CoreEvents {
  'account.changed': Account;
  'message.received': Message;
  'message.updated': Message;
  'chat.updated': Chat;
  'contact.updated': Contact;
  /** A stranger asks to be a contact; the request stays in `contacts.requests()` until answered. */
  'contact.requested': ContactRequest;
  /** The blocklist changed (XEP-0191); the payload is the whole sorted list of bare JIDs. */
  'contacts.blocked': string[];
  /** The peer of a direct chat started or stopped typing (XEP-0085). */
  'chat.typing': { chatId: string; fromJid: string; typing: boolean };
  'room.updated': Room;
  'room.members': { jid: string; members: RoomMember[] };
  'devices.changed': { jid: string; devices: Device[] };
  /** The UI asks to show a chat (a click on a notification, an `xmpp:` link). */
  'chat.requested': { chatId: string };
  /**
   * The Claude (MCP) settings or the token changed; the desktop app starts, stops, moves or
   * restarts its listener.
   */
  'assistant.changed': AssistantSettings;
  /** Claude wants to send a message: the UI asks the user (`assistant.answerSend`). */
  'assistant.sendRequested': SendRequest;
  /** A send request is over (answered or timed out): the UI closes its dialog. */
  'assistant.sendSettled': { id: string };
}

export interface EventBus {
  /** Subscribes and returns the function that unsubscribes. */
  on<K extends keyof CoreEvents>(event: K, handler: (payload: CoreEvents[K]) => void): () => void;
  emit<K extends keyof CoreEvents>(event: K, payload: CoreEvents[K]): void;
}
