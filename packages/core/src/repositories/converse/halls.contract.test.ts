// @vitest-environment jsdom
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { RoomInvitation } from '../../contracts/types';
import { createConverseRepositories } from './index';
import { AVAILABLE, type BobClient, connectBob } from './test-support/bobClient';
import { prepareContractEnvironment, until } from './test-support/contractEnv';

/**
 * Halls the Slack way against the real test server (spec 2026-10-16-halls-slack-design): alice is
 * the app's repositories, bob a hand-written client. Skipped unless `XMPP_TEST_SERVER` is set
 * (`pnpm test:contract`). Room names carry a run token: the server keeps destroyed names a while.
 */

const { SERVER, TIMEOUT } = await prepareContractEnvironment();
const ALICE = 'alice@localhost';
const BOB = 'bob@localhost';
const RUN = Date.now().toString(36);
const SERVICE = 'rooms.localhost';
const MUC_USER = 'http://jabber.org/protocol/muc#user';
const HALL = `team-${RUN}@${SERVICE}`;

const repositories = createConverseRepositories({
  persistentStore: 'localStorage',
  priority: 10,
  connectTimeoutMs: 8_000,
});
const invitations: RoomInvitation[] = [];
const destroyed: string[] = [];
repositories.invitations.onInvitation((invitation) => invitations.push(invitation));
repositories.roomAdmin.onDestroyed((jid) => destroyed.push(jid));

let bob: BobClient;
const fromRoom = (stanza: Element) => (stanza.getAttribute('from') ?? '').split('/')[0] === HALL;

describe.skipIf(!SERVER)('halls against the XMPP test server', () => {
  beforeAll(async () => {
    bob = await connectBob({ url: SERVER ?? '', jid: BOB, password: 'bob-pw' });
    bob.send(AVAILABLE);
    await repositories.xmpp.connect({
      jid: ALICE,
      password: 'alice-pw',
      websocketUrl: SERVER ?? '',
    });
  }, TIMEOUT);

  afterAll(async () => {
    await bob.close();
    await repositories.xmpp.disconnect().catch(() => undefined);
  }, TIMEOUT);

  it(
    '1. alice creates a private hall, configured before anyone can enter',
    async () => {
      const room = await repositories.roomAdmin.create({
        service: SERVICE,
        localpart: `team-${RUN}`,
        nick: 'alice',
        settings: { name: 'Team', description: 'Release work', visibility: 'private' },
      });
      expect(room).toMatchObject({ jid: HALL, affiliation: 'owner', visibility: 'private' });
      const settings = await repositories.roomAdmin.settings(HALL);
      expect(settings).toMatchObject({ visibility: 'private', description: 'Release work' });
      await expect(
        repositories.roomAdmin.create({
          service: SERVICE,
          localpart: `team-${RUN}`,
          nick: 'alice',
          settings: { name: 'Again', description: '', visibility: 'public' },
        }),
      ).rejects.toMatchObject({ code: 'RoomExists' });
    },
    TIMEOUT,
  );

  it(
    '2. invites bob, who gets the invitation from alice and may then enter the private hall',
    async () => {
      bob.forget();
      await repositories.roomAdmin.invite(HALL, BOB);
      const invite = await bob.waitFor(
        (s) => fromRoom(s) && s.getElementsByTagNameNS(MUC_USER, 'invite').length > 0,
      );
      expect(
        invite.getElementsByTagNameNS(MUC_USER, 'invite')[0]?.getAttribute('from')?.split('/')[0],
      ).toBe(ALICE);
      await bob.joinRoom(HALL, 'bob');
      const people = await repositories.roomAdmin.affiliations(HALL);
      expect(people).toEqual(
        expect.arrayContaining([expect.objectContaining({ jid: BOB, affiliation: 'member' })]),
      );
    },
    TIMEOUT,
  );

  it(
    '3. makes bob admin, sets the topic, then removes bob',
    async () => {
      await repositories.roomAdmin.setAffiliation(HALL, BOB, 'admin');
      expect(await repositories.roomAdmin.affiliations(HALL)).toEqual(
        expect.arrayContaining([expect.objectContaining({ jid: BOB, affiliation: 'admin' })]),
      );
      bob.forget();
      await repositories.roomAdmin.setTopic(HALL, `Ship it ${RUN}`);
      const subject = await bob.waitFor(
        (s) => fromRoom(s) && s.getElementsByTagName('subject').length > 0,
      );
      expect(subject.getElementsByTagName('subject')[0]?.textContent).toBe(`Ship it ${RUN}`);
      await repositories.roomAdmin.setAffiliation(HALL, BOB, 'member');
      bob.forget();
      await repositories.roomAdmin.kick(HALL, 'bob');
      const gone = await bob.waitFor(
        (s) =>
          fromRoom(s) && s.localName === 'presence' && s.getAttribute('type') === 'unavailable',
      );
      const codes = Array.from(gone.getElementsByTagNameNS(MUC_USER, 'status')).map((c) =>
        c.getAttribute('code'),
      );
      expect(codes).toContain('307');
    },
    TIMEOUT,
  );

  it(
    '4. receives bob’s invitation to his own hall, naming who invited',
    async () => {
      const bobsHall = `bob-${RUN}@${SERVICE}`;
      await bob.joinRoom(bobsHall, 'bob');
      bob.send(
        `<message to="${bobsHall}"><x xmlns="${MUC_USER}"><invite to="${ALICE}"><reason>Come in ${RUN}</reason></invite></x></message>`,
      );
      await until(() => invitations.find((i) => i.roomJid === bobsHall), 'bob’s invitation');
      // Bob's hall is semi-anonymous: the server names him by his seat, not his real address.
      expect(invitations.find((i) => i.roomJid === bobsHall)).toMatchObject({
        fromJid: `${bobsHall}/bob`,
        reason: `Come in ${RUN}`,
      });
      // The invitation's fallback body must not leave a direct chat with the hall's address.
      const stray = async () =>
        (await repositories.chat.list()).some((c) => c.id === bobsHall && c.kind === 'direct');
      for (let attempt = 0; attempt < 40 && (await stray()); attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      expect(await stray()).toBe(false);
    },
    TIMEOUT,
  );

  it(
    '5. destroys the hall: bob is told, alice reports it once',
    async () => {
      await repositories.roomAdmin.destroy(HALL, `Done ${RUN}`);
      expect(destroyed.filter((jid) => jid === HALL)).toEqual([HALL]);
      await expect(repositories.roomAdmin.settings(HALL)).rejects.toBeTruthy();
    },
    TIMEOUT,
  );
});
