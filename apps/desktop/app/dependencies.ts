import { type CoreDependencies, createConverseRepositories } from '@hey-postie/core';
import { TauriKeychain } from './repositories/keychain';
import { ConsoleNotifier } from './repositories/notifier';
import { NotYetTransport } from './repositories/transport';

/**
 * The real repositories of the desktop app. XMPP, roster and chats come from the Converse engine
 * (`packages/core/src/repositories/converse/`); the transport (the Rust relay) and the system
 * notifier arrive with the rest of milestone 1.
 */
export function createTauriDependencies(): CoreDependencies {
  const { xmpp, roster, chat } = createConverseRepositories();
  return {
    keychain: new TauriKeychain(),
    transport: new NotYetTransport(),
    xmpp,
    roster,
    chat,
    notifier: new ConsoleNotifier(),
  };
}
