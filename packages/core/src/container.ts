import type {
  ChatRepository,
  KeychainRepository,
  Notifier,
  RosterRepository,
  TransportRepository,
  XmppRepository,
} from './contracts/repositories';
import type { Core } from './contracts/services';
import { createAccountsService } from './services/accounts';
import { createChatsService } from './services/chats';
import { createContactsService } from './services/contacts';
import { createEventBus } from './services/events';
import { createNotificationsService } from './services/notifications';

export interface CoreDependencies {
  keychain: KeychainRepository;
  transport: TransportRepository;
  xmpp: XmppRepository;
  roster: RosterRepository;
  chat: ChatRepository;
  notifier: Notifier;
}

/** The one place where services meet their repositories. */
export function createCore(deps: CoreDependencies): Core {
  const events = createEventBus();
  const accounts = createAccountsService(deps, events);
  const contacts = createContactsService(deps, events);
  const chats = createChatsService(deps, events);
  const notifications = createNotificationsService(deps, events);
  return { accounts, contacts, chats, notifications, events };
}
