import type { AssistantSettings, Draft } from './services';
import type {
  Account,
  Chat,
  Contact,
  ContactRequest,
  Device,
  Message,
  Room,
  RoomInvitation,
  RoomMember,
} from './types';

export interface CoreEvents {
  'account.changed': Account;
  'message.received': Message;
  'message.updated': Message;
  /** The user hid a message on this device: the interface drops it from the list. */
  'message.hidden': { chatId: string; messageId: string };
  'chat.updated': Chat;
  'contact.updated': Contact;
  /** A stranger asks to be a contact; the request stays in `contacts.requests()` until answered. */
  'contact.requested': ContactRequest;
  /** The blocklist changed (XEP-0191); the payload is the whole sorted list of bare JIDs. */
  'contacts.blocked': string[];
  /** The peer of a direct chat started or stopped typing (XEP-0085). */
  'chat.typing': { chatId: string; fromJid: string; typing: boolean };
  'room.updated': Room;
  /** Someone invites the user to a hall: it waits in `rooms.invitations()` until answered. */
  'room.invited': RoomInvitation;
  /** A hall was destroyed; it left the list. */
  'room.destroyed': { jid: string; reason?: string };
  'room.members': { jid: string; members: RoomMember[] };
  'devices.changed': { jid: string; devices: Device[] };
  /** The UI asks to show a chat (a click on a notification, an `xmpp:` link). */
  'chat.requested': { chatId: string };
  /**
   * The Claude (MCP) settings or the token changed; the desktop app starts, stops, moves or
   * restarts its listener.
   */
  'assistant.changed': AssistantSettings;
  /** Claude prepared a letter: the interface puts it in that chat's composer. */
  'assistant.draft': Draft;
}

export interface EventBus {
  /** Subscribes and returns the function that unsubscribes. */
  on<K extends keyof CoreEvents>(event: K, handler: (payload: CoreEvents[K]) => void): () => void;
  emit<K extends keyof CoreEvents>(event: K, payload: CoreEvents[K]): void;
}
