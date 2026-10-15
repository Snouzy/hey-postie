import { type CoreDependencies, createConverseRepositories, FakeCrypto } from '@hey-postie/core';
import { TauriKeychain } from './repositories/keychain';
import { TauriNotifier } from './repositories/notifier';
import { TauriTransport } from './repositories/transport';

/**
 * The real repositories of the desktop app. XMPP, roster, chats, rooms, registration and files come from the Converse engine
 * (`packages/core/src/repositories/converse/`); the transport is the Rust relay and the notifier
 * the system's (`./repositories/`).
 */
export function createTauriDependencies(): CoreDependencies {
  const { xmpp, roster, chat, room, registration, file } = createConverseRepositories();
  return {
    keychain: new TauriKeychain(),
    transport: new TauriTransport(),
    xmpp,
    roster,
    chat,
    room,
    // Milestone 3 replaces the fake with the Converse OMEMO repository.
    crypto: new FakeCrypto(),
    registration,
    file,
    notifier: new TauriNotifier(),
  };
}
