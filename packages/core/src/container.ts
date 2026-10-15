import type {
  ChatRepository,
  CryptoRepository,
  KeychainRepository,
  Notifier,
  RoomRepository,
  RosterRepository,
  TransportRepository,
  XmppRepository,
} from './contracts/repositories';
import type { Core } from './contracts/services';
import { createAccountsService } from './services/accounts';
import { createChatsService } from './services/chats';
import { createContactsService } from './services/contacts';
import { createCryptoService } from './services/crypto';
import { createEventBus } from './services/events';
import { createNotificationsService } from './services/notifications';
import { createRoomsService } from './services/rooms';

export interface CoreDependencies {
  keychain: KeychainRepository;
  transport: TransportRepository;
  xmpp: XmppRepository;
  roster: RosterRepository;
  chat: ChatRepository;
  room: RoomRepository;
  crypto: CryptoRepository;
  notifier: Notifier;
}

/** The one place where services meet their repositories. */
export function createCore(deps: CoreDependencies): Core {
  const events = createEventBus();
  const accounts = createAccountsService(deps, events);
  const contacts = createContactsService(deps, events);
  const chats = createChatsService(deps, events);
  const rooms = createRoomsService(deps, events);
  const crypto = createCryptoService(deps, events);
  const notifications = createNotificationsService(deps, events);
  return { accounts, contacts, chats, rooms, crypto, notifications, events };
}
