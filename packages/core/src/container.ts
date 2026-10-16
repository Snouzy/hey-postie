import type {
  ChatRepository,
  CryptoRepository,
  FileRepository,
  KeychainRepository,
  Notifier,
  RegistrationRepository,
  RoomRepository,
  RosterRepository,
  TransportRepository,
  XmppRepository,
} from './contracts/repositories';
import type { Core } from './contracts/services';
import { createAccountsService } from './services/accounts';
import { createAssistantService } from './services/assistant';
import { createChatsService } from './services/chats';
import { createContactsService } from './services/contacts';
import { createCryptoService } from './services/crypto';
import { createEventBus } from './services/events';
import { createFilesService } from './services/files';
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
  registration: RegistrationRepository;
  file: FileRepository;
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
  const files = createFilesService(deps);
  const notifications = createNotificationsService(deps, events);
  const assistant = createAssistantService(deps, events);
  return { accounts, contacts, chats, rooms, crypto, files, notifications, assistant, events };
}
