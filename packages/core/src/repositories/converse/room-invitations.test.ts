// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { parseInvitation } from './room-invitations';

const parse = (xml: string) =>
  parseInvitation(new DOMParser().parseFromString(xml, 'text/xml').documentElement);

describe('parseInvitation', () => {
  it('reads a mediated invitation: the real inviter, the reason and the password', () => {
    expect(
      parse(
        `<message from="team@rooms.x.org" xmlns="jabber:client"><x xmlns="http://jabber.org/protocol/muc#user"><invite from="Bob@x.org/phone"><reason>Hi</reason></invite><password>pw</password></x><x xmlns="jabber:x:conference" jid="team@rooms.x.org">Hi</x></message>`,
      ),
    ).toEqual({ roomJid: 'team@rooms.x.org', fromJid: 'bob@x.org', reason: 'Hi', password: 'pw' });
  });

  it('keeps the seat when the hall hides the real address', () => {
    expect(
      parse(
        `<message from="team@rooms.x.org" xmlns="jabber:client"><x xmlns="http://jabber.org/protocol/muc#user"><invite from="team@rooms.x.org/bob"/></x></message>`,
      ),
    ).toEqual({ roomJid: 'team@rooms.x.org', fromJid: 'team@rooms.x.org/bob' });
  });

  it('reads a direct invitation, and ignores any other message', () => {
    expect(
      parse(
        `<message from="bob@x.org/phone" xmlns="jabber:client"><x xmlns="jabber:x:conference" jid="Team@rooms.x.org" reason="Join us"/></message>`,
      ),
    ).toEqual({ roomJid: 'team@rooms.x.org', fromJid: 'bob@x.org', reason: 'Join us' });
    expect(
      parse('<message from="bob@x.org" xmlns="jabber:client"><body>hello</body></message>'),
    ).toBeNull();
  });
});
