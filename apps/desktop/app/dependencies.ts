import { type CoreDependencies, createConverseRepositories, FakeFile } from '@hey-postie/core';
import { TauriKeychain } from './repositories/keychain';
import { TauriNotifier } from './repositories/notifier';
import { TauriTransport } from './repositories/transport';

/**
 * The real repositories of the desktop app. XMPP, roster, chats, rooms, OMEMO and registration
 * come from the Converse engine
 * (`packages/core/src/repositories/converse/`); the transport is the Rust relay and the notifier
 * the system's (`./repositories/`).
 */
export function createTauriDependencies(): CoreDependencies {
  const { xmpp, roster, chat, room, crypto, registration } = createConverseRepositories();
  return {
    keychain: new TauriKeychain(),
    transport: new TauriTransport(),
    xmpp,
    roster,
    chat,
    room,
    crypto,
    registration,
    // Milestone 4 replaces the fake with the Converse file repository.
    file: new FakeFile(),
    notifier: new TauriNotifier(),
  };
}
