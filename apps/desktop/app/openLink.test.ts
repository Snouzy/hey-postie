import { describe, expect, it } from 'vitest';
import { isOpenableLink } from './openLink';

describe('isOpenableLink', () => {
  it('accepts web and mail links, whatever the case of the scheme', () => {
    expect(isOpenableLink('https://example.org/path?q=1')).toBe(true);
    expect(isOpenableLink('http://example.org')).toBe(true);
    expect(isOpenableLink('HTTPS://EXAMPLE.ORG')).toBe(true);
    expect(isOpenableLink('mailto:alice@example.org')).toBe(true);
  });

  it('refuses scripts, local files and other schemes', () => {
    expect(isOpenableLink('javascript:alert(1)')).toBe(false);
    expect(isOpenableLink('JavaScript:alert(1)')).toBe(false);
    expect(isOpenableLink('file:///etc/passwd')).toBe(false);
    expect(isOpenableLink('data:text/html,hi')).toBe(false);
    expect(isOpenableLink('xmpp:alice@example.org')).toBe(false);
    expect(isOpenableLink('tel:+33600000000')).toBe(false);
  });

  it('refuses what is not a URL', () => {
    expect(isOpenableLink('')).toBe(false);
    expect(isOpenableLink('example.org')).toBe(false);
    expect(isOpenableLink('  https://example.org')).toBe(true);
  });
});
