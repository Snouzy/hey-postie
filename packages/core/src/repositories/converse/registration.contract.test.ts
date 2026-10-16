// @vitest-environment jsdom
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createCore } from '../../container';
import { DomainError } from '../../contracts/errors';
import type { Core } from '../../contracts/services';
import type { Account } from '../../contracts/types';
import {
  FakeCrypto,
  FakeFile,
  FakeHiddenMessages,
  FakeKeychain,
  FakeNotifier,
  FakeRoom,
  FakeRoomAdmin,
  FakeRoomInvitations,
} from '../../fakes';
import { createConverseRepositories } from './index';
import { restoreNodeEvent, serveHeadlessAssets } from './test-support/realSocket';

/**
 * XEP-0077 against the local Prosody (tools/xmpp-server, `allow_registration = true`): the
 * repository alone for the form and a first account, then the whole core (`accounts.register`,
 * `deleteAccount`) with the real repositories. Accounts carry a run token and are deleted at the
 * end. Skipped unless `XMPP_TEST_SERVER` is set; `pnpm test:contract` sets it.
 */

const SERVER = (globalThis as { process?: { env: Record<string, string | undefined> } }).process
  ?.env.XMPP_TEST_SERVER;
const DOMAIN = 'localhost';
const TIMEOUT = 15_000;
const RUN = Date.now().toString(36);
const FIRST = `reg-${RUN}-a`;
const SECOND = `reg-${RUN}-b`;
const PASSWORD = `pw-${RUN}-long-enough`;

const repositories = createConverseRepositories({
  persistentStore: 'localStorage',
  priority: 10,
  connectTimeoutMs: 8_000,
});
let core: Core;
const accounts: Account[] = [];
// Same module instance as the engine's lazy import: the singleton is shared.
const headless = (await import('@converse/headless')) as unknown as {
  api: { waitUntil(name: string): Promise<unknown> | null };
};

const code = (promise: Promise<unknown>) =>
  promise.then(
    () => 'resolved',
    (error: unknown) => (error instanceof DomainError ? error.code : String(error)),
  );

/**
 * A new account generates its OMEMO bundle right after sign-in (slow key generation). Deleting the
 * account meanwhile clears the device lists under `generateBundle`, which then throws an unhandled
 * rejection that libomemo's glue turns into a worker exit (converse.md §11).
 */
async function deleteSignedInAccount(): Promise<void> {
  await headless.api.waitUntil('OMEMOInitialized');
  await core.accounts.deleteAccount();
}

describe.skipIf(!SERVER)('Converse registration against the XMPP test server', () => {
  beforeAll(async () => {
    await restoreNodeEvent();
    await serveHeadlessAssets();
    const room = new FakeRoom();
    core = createCore({
      ...repositories,
      keychain: new FakeKeychain(),
      transport: { websocketUrlFor: async () => SERVER ?? '' },
      room,
      roomAdmin: new FakeRoomAdmin(room),
      invitations: new FakeRoomInvitations(),
      crypto: new FakeCrypto(),
      file: new FakeFile(),
      hidden: new FakeHiddenMessages(),
      notifier: new FakeNotifier(),
    });
    core.events.on('account.changed', (account) => accounts.push(account));
  });

  afterAll(async () => {
    // Leave the server as it was: whatever account is still signed in or registered goes away.
    if (core.accounts.current()?.state === 'online')
      await deleteSignedInAccount().catch(() => undefined);
    await core.accounts
      .signIn({ jid: `${FIRST}@${DOMAIN}`, password: PASSWORD, remember: false })
      .then(deleteSignedInAccount)
      .catch(() => undefined);
    await repositories.xmpp.disconnect().catch(() => undefined);
  }, TIMEOUT * 2);

  it(
    '1. fetches the registration form of localhost: username and password',
    async () => {
      const form = await repositories.registration.form({
        domain: DOMAIN,
        websocketUrl: SERVER ?? '',
      });
      expect(form.domain).toBe(DOMAIN);
      expect(form.instructions).toBeTruthy();
      const byName = new Map(form.fields.map((f) => [f.name, f]));
      expect(byName.get('username')).toMatchObject({ type: 'text', required: true });
      expect(byName.get('password')).toMatchObject({ type: 'password', required: true });
      expect(form.captchaImageDataUrl).toBeUndefined();
    },
    TIMEOUT,
  );

  it(
    '2. submit creates an account on the stream the form came from',
    async () => {
      await repositories.registration.submit({
        domain: DOMAIN,
        websocketUrl: SERVER ?? '',
        values: { username: FIRST, password: PASSWORD },
      });
      // The account exists: a second registration of the same name is a conflict.
      await expect(
        code(
          repositories.registration.submit({
            domain: DOMAIN,
            websocketUrl: SERVER ?? '',
            values: { username: FIRST, password: PASSWORD },
          }),
        ),
      ).resolves.toBe('AccountConflict');
    },
    TIMEOUT,
  );

  it(
    '3. accounts.register through the real repositories ends signed in',
    async () => {
      const account = await core.accounts.register({
        domain: DOMAIN,
        username: SECOND,
        password: PASSWORD,
      });
      expect(account).toMatchObject({ jid: `${SECOND}@${DOMAIN}`, state: 'online' });
      expect(core.accounts.current()?.state).toBe('online');
    },
    TIMEOUT,
  );

  it(
    '4. registering the same name again is an AccountConflict, the session stays online',
    async () => {
      await expect(
        code(core.accounts.register({ domain: DOMAIN, username: SECOND, password: PASSWORD })),
      ).resolves.toBe('AccountConflict');
      expect(core.accounts.current()?.state).toBe('online');
    },
    TIMEOUT,
  );

  it(
    '5. deleteAccount removes the account: the next sign-in fails with InvalidCredentials',
    async () => {
      await deleteSignedInAccount();
      expect(core.accounts.current()).toBeNull();
      expect(accounts.at(-1)).toMatchObject({ jid: `${SECOND}@${DOMAIN}`, state: 'offline' });
      await expect(
        code(
          core.accounts.signIn({ jid: `${SECOND}@${DOMAIN}`, password: PASSWORD, remember: false }),
        ),
      ).resolves.toBe('InvalidCredentials');
    },
    TIMEOUT,
  );
});
