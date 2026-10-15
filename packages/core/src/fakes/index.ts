import type { CoreDependencies } from '../container';
import { FakeKeychain } from './keychain';
import { FakeNotifier } from './notifier';
import { FakeTransport } from './transport';
import { FakeXmpp } from './xmpp';

export { FakeKeychain, FakeNotifier, FakeTransport, FakeXmpp };

export interface FakeDependencies extends CoreDependencies {
  /** The same instances, typed as fakes so tests can inspect and configure them. */
  fakes: {
    keychain: FakeKeychain;
    transport: FakeTransport;
    xmpp: FakeXmpp;
    notifier: FakeNotifier;
  };
}

export function createFakeDependencies(): FakeDependencies {
  const fakes = {
    keychain: new FakeKeychain(),
    transport: new FakeTransport(),
    xmpp: new FakeXmpp(),
    notifier: new FakeNotifier(),
  };
  return { ...fakes, fakes };
}
