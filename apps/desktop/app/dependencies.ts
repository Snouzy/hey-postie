import { type CoreDependencies, createConverseRepositories } from '@hey-postie/core';
import { TauriKeychain } from './repositories/keychain';
import { TauriNotifier } from './repositories/notifier';
import { TauriTransport } from './repositories/transport';

/**
 * The real repositories of the desktop app. XMPP, roster and chats come from the Converse engine
 * (`packages/core/src/repositories/converse/`); the transport is the Rust relay and the notifier
 * the system's (`./repositories/`).
 */
export function createTauriDependencies(): CoreDependencies {
  const { xmpp, roster, chat } = createConverseRepositories();
  return {
    keychain: new TauriKeychain(),
    transport: new TauriTransport(),
    xmpp,
    roster,
    chat,
    notifier: new TauriNotifier(),
  };
}
