import { type CoreDependencies, FakeChat, FakeRoster } from '@hey-postie/core';
import { TauriKeychain } from './repositories/keychain';
import { TauriNotifier } from './repositories/notifier';
import { TauriTransport } from './repositories/transport';
import { NotYetXmpp } from './repositories/xmpp';

/**
 * The real repositories of the desktop app. Until the Converse repository lands (milestone 1),
 * the roster and the chats are the in-memory fakes, so the interface can be built against them.
 */
export function createTauriDependencies(): CoreDependencies {
  return {
    keychain: new TauriKeychain(),
    transport: new TauriTransport(),
    xmpp: new NotYetXmpp(),
    roster: new FakeRoster(),
    chat: new FakeChat(),
    notifier: new TauriNotifier(),
  };
}
