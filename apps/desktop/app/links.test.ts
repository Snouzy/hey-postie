import { describe, expect, it } from 'vitest';
import { jidFromXmppLink } from './links';

describe('jidFromXmppLink', () => {
  it('keeps the bare JID of a plain link', () => {
    expect(jidFromXmppLink('xmpp:Alice@Example.org')).toBe('alice@example.org');
  });

  it('drops the query', () => {
    expect(jidFromXmppLink('xmpp:alice@example.org?message;body=hi')).toBe('alice@example.org');
  });

  it('skips the authority of the // form', () => {
    expect(jidFromXmppLink('xmpp://me@mine.org/alice@example.org')).toBe('alice@example.org');
  });

  it('decodes percent-encoded characters', () => {
    expect(jidFromXmppLink('xmpp:ali%40ce@example.org')).toBeNull();
    expect(jidFromXmppLink('xmpp:al%69ce@example.org')).toBe('alice@example.org');
  });

  it('refuses other schemes and invalid JIDs', () => {
    expect(jidFromXmppLink('https://example.org')).toBeNull();
    expect(jidFromXmppLink('xmpp:example.org')).toBeNull();
    expect(jidFromXmppLink('xmpp:')).toBeNull();
  });
});
