import type { CoreDependencies } from '../container';
import { FakeChat } from './chat';
import { FakeCrypto } from './crypto';
import { FakeFile } from './file';
import { FakeKeychain } from './keychain';
import { FakeNotifier } from './notifier';
import { FakeRegistration } from './registration';
import { FakeRoom } from './room';
import { FakeRoster } from './roster';
import { FakeTransport } from './transport';
import { FakeXmpp } from './xmpp';

export {
  FakeChat,
  FakeCrypto,
  FakeFile,
  FakeKeychain,
  FakeNotifier,
  FakeRegistration,
  FakeRoom,
  FakeRoster,
  FakeTransport,
  FakeXmpp,
};

export interface FakeDependencies extends CoreDependencies {
  /** The same instances, typed as fakes so tests can inspect and configure them. */
  fakes: {
    keychain: FakeKeychain;
    transport: FakeTransport;
    xmpp: FakeXmpp;
    roster: FakeRoster;
    chat: FakeChat;
    room: FakeRoom;
    crypto: FakeCrypto;
    registration: FakeRegistration;
    file: FakeFile;
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
    crypto: new FakeCrypto(),
    registration: new FakeRegistration(),
    file: new FakeFile(),
    notifier: new FakeNotifier(),
  };
  return { ...fakes, fakes };
}
