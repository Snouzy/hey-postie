import type { CoreDependencies } from '@hey-postie/core';
import { TauriKeychain } from './repositories/keychain';
import { ConsoleNotifier } from './repositories/notifier';
import { NotYetTransport } from './repositories/transport';
import { NotYetXmpp } from './repositories/xmpp';

/** The real repositories of the desktop app. Milestone 1 replaces the two placeholders. */
export function createTauriDependencies(): CoreDependencies {
  return {
    keychain: new TauriKeychain(),
    transport: new NotYetTransport(),
    xmpp: new NotYetXmpp(),
    notifier: new ConsoleNotifier(),
  };
}
