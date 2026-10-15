import type {
  KeychainRepository,
  Notifier,
  TransportRepository,
  XmppRepository,
} from './contracts/repositories';
import type { Core } from './contracts/services';
import { createAccountsService } from './services/accounts';
import { createEventBus } from './services/events';

export interface CoreDependencies {
  keychain: KeychainRepository;
  transport: TransportRepository;
  xmpp: XmppRepository;
  notifier: Notifier;
}

/** The one place where services meet their repositories. */
export function createCore(deps: CoreDependencies): Core {
  const events = createEventBus();
  const accounts = createAccountsService(deps, events);
  return { accounts, events };
}
