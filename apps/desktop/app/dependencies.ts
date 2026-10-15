import { type CoreDependencies, createConverseRepositories, FakeRoom } from '@hey-postie/core';
import { TauriKeychain } from './repositories/keychain';
import { TauriNotifier } from './repositories/notifier';
import { TauriTransport } from './repositories/transport';

/**
 * The real repositories of the desktop app. XMPP, roster, chats, OMEMO and registration come from
 * the Converse engine
 * (`packages/core/src/repositories/converse/`); the transport is the Rust relay and the notifier
 * the system's (`./repositories/`).
 */
export function createTauriDependencies(): CoreDependencies {
  const { xmpp, roster, chat, crypto, registration } = createConverseRepositories();
  return {
    keychain: new TauriKeychain(),
    transport: new TauriTransport(),
    xmpp,
    roster,
    chat,
    // Milestone 2 replaces the fake with the Converse MUC repository.
    room: new FakeRoom(),
    crypto,
    registration,
    notifier: new TauriNotifier(),
  };
}
