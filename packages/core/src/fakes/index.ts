import type { CoreDependencies } from '../container';
import { FakeChat } from './chat';
import { FakeKeychain } from './keychain';
import { FakeNotifier } from './notifier';
import { FakeRoom } from './room';
import { FakeRoster } from './roster';
import { FakeTransport } from './transport';
import { FakeXmpp } from './xmpp';

export { FakeChat, FakeKeychain, FakeNotifier, FakeRoom, FakeRoster, FakeTransport, FakeXmpp };

export interface FakeDependencies extends CoreDependencies {
  /** The same instances, typed as fakes so tests can inspect and configure them. */
  fakes: {
    keychain: FakeKeychain;
    transport: FakeTransport;
    xmpp: FakeXmpp;
    roster: FakeRoster;
    chat: FakeChat;
    room: FakeRoom;
    notifier: FakeNotifier;
  };
}

export function createFakeDependencies(): FakeDependencies {
  const fakes = {
    keychain: new FakeKeychain(),
    transport: new FakeTransport(),
    xmpp: new FakeXmpp(),
    roster: new FakeRoster(),
    chat: new FakeChat(),
    room: new FakeRoom(),
    notifier: new FakeNotifier(),
  };
  return { ...fakes, fakes };
}
