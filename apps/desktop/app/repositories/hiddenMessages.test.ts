import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LocalHiddenMessages } from './hiddenMessages';

// The desktop tests run in Node: a small in-memory localStorage stands in for the webview's.
beforeEach(() => {
  const items = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => items.set(key, value),
  });
});

describe('LocalHiddenMessages', () => {
  it('keeps the hidden ids per account, once each, across instances', async () => {
    await new LocalHiddenMessages().add('me@x.org', 'm1');
    await new LocalHiddenMessages().add('me@x.org', 'm1');
    await new LocalHiddenMessages().add('other@x.org', 'm2');
    expect(await new LocalHiddenMessages().list('me@x.org')).toEqual(['m1']);
    expect(await new LocalHiddenMessages().list('other@x.org')).toEqual(['m2']);
  });

  it('reads damaged storage as an empty list', async () => {
    localStorage.setItem('hey-postie:hidden-messages', '{not json');
    expect(await new LocalHiddenMessages().list('me@x.org')).toEqual([]);
  });
});
