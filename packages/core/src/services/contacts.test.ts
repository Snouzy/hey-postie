import { beforeEach, describe, expect, it } from 'vitest';
import { createCore } from '../container';
import type { Contact } from '../contracts/types';
import { createFakeDependencies } from '../fakes';

let deps: ReturnType<typeof createFakeDependencies>;
let core: ReturnType<typeof createCore>;

beforeEach(() => {
  deps = createFakeDependencies();
  core = createCore(deps);
});

const contact = (jid: string, name: string, presence: Contact['presence']): Contact => ({
  jid,
  name,
  presence,
  subscription: 'both',
});

describe('contacts.list', () => {
  it('puts online contacts first, then by name', async () => {
    deps.fakes.roster.seed(
      contact('zoe@x.org', 'Zoé', 'online'),
      contact('amy@x.org', 'Amy', 'offline'),
      contact('bob@x.org', 'Bob', 'away'),
      contact('al@x.org', 'Al', 'online'),
    );
    const names = (await core.contacts.list()).map((c) => c.name);
    expect(names).toEqual(['Al', 'Zoé', 'Bob', 'Amy']);
  });
});

describe('contacts.add', () => {
  it('normalizes the jid, drops a resource and a blank name', async () => {
    const added = await core.contacts.add({ jid: ' Bob@X.org/phone ', name: '  ' });
    expect(added.jid).toBe('bob@x.org');
    expect(added.name).toBe('bob');
  });

  it('refuses an invalid jid', async () => {
    await expect(core.contacts.add({ jid: 'bob' })).rejects.toThrow(/InvalidJid/);
  });

  it('emits contact.updated', async () => {
    const seen: string[] = [];
    core.events.on('contact.updated', (c) => seen.push(c.jid));
    await core.contacts.add({ jid: 'bob@x.org' });
    expect(seen).toEqual(['bob@x.org']);
  });
});

describe('presence changes', () => {
  it('reach the UI as contact.updated', async () => {
    const seen: Contact['presence'][] = [];
    core.events.on('contact.updated', (c) => seen.push(c.presence));
    deps.fakes.roster.change(contact('bob@x.org', 'Bob', 'dnd'));
    expect(seen).toEqual(['dnd']);
  });
});
