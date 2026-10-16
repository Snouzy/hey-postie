import type { CoreDependencies } from '../container';
import { FakeChat } from './chat';
import { FakeCrypto } from './crypto';
import { FakeFile } from './file';
import { FakeHiddenMessages } from './hiddenMessages';
import { FakeKeychain } from './keychain';
import { FakeNotifier } from './notifier';
import { FakeRegistration } from './registration';
import { FakeRoom } from './room';
import { FakeRoomAdmin, FakeRoomInvitations } from './roomAdmin';
import { FakeRoster } from './roster';
import { FakeTransport } from './transport';
import { FakeXmpp } from './xmpp';

export {
  FakeChat,
  FakeCrypto,
  FakeFile,
  FakeHiddenMessages,
  FakeKeychain,
  FakeNotifier,
  FakeRegistration,
  FakeRoom,
  FakeRoomAdmin,
  FakeRoomInvitations,
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
    roomAdmin: FakeRoomAdmin;
    invitations: FakeRoomInvitations;
    crypto: FakeCrypto;
    registration: FakeRegistration;
    file: FakeFile;
    hidden: FakeHiddenMessages;
    notifier: FakeNotifier;
  };
}

export function createFakeDependencies(): FakeDependencies {
  const room = new FakeRoom();
  const fakes = {
    keychain: new FakeKeychain(),
    transport: new FakeTransport(),
    xmpp: new FakeXmpp(),
    roster: new FakeRoster(),
    chat: new FakeChat(),
    room,
    roomAdmin: new FakeRoomAdmin(room),
    invitations: new FakeRoomInvitations(),
    crypto: new FakeCrypto(),
    registration: new FakeRegistration(),
    file: new FakeFile(),
    hidden: new FakeHiddenMessages(),
    notifier: new FakeNotifier(),
  };
  return { ...fakes, fakes };
}
