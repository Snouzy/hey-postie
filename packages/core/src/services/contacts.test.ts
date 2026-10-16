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

describe('message requests', () => {
  const eve = { jid: 'eve@x.org', name: 'Eve', message: 'hi there' };

  it('lists a pending request and emits contact.requested', async () => {
    const seen: string[] = [];
    core.events.on('contact.requested', (r) => seen.push(r.jid));
    deps.fakes.roster.request(eve);
    expect(seen).toEqual(['eve@x.org']);
    expect(await core.contacts.requests()).toEqual([eve]);
    expect(await core.contacts.list()).toEqual([]);
  });

  it('cleans the name and the sentence, which come from the stranger', async () => {
    deps.fakes.roster.request({
      jid: 'eve@x.org',
      name: ' \u0007 ',
      message: `\u0000${'x'.repeat(300)} `,
    });
    const [request] = await core.contacts.requests();
    expect(request?.name).toBe('eve');
    expect(request?.message).toHaveLength(280);
    deps.fakes.roster.request({ jid: 'al@x.org', name: 'Al', message: '  ' });
    expect((await core.contacts.requests())[1]).toEqual({ jid: 'al@x.org', name: 'Al' });
  });

  it('accepting puts the stranger in the roster and emits contact.updated', async () => {
    const seen: string[] = [];
    core.events.on('contact.updated', (c) => seen.push(`${c.jid}:${c.subscription}`));
    deps.fakes.roster.request(eve);
    const contact = await core.contacts.accept(' Eve@X.org/phone ');
    expect(contact.name).toBe('Eve');
    expect(await core.contacts.requests()).toEqual([]);
    expect((await core.contacts.list()).map((c) => c.jid)).toEqual(['eve@x.org']);
    expect(seen).toEqual(['eve@x.org:from']);
  });

  it('ignoring hides the request until the stranger asks again', async () => {
    deps.fakes.roster.request(eve);
    await core.contacts.ignore('eve@x.org');
    expect(await core.contacts.requests()).toEqual([]);
    expect(await core.contacts.list()).toEqual([]);
    deps.fakes.roster.request(eve);
    expect(await core.contacts.requests()).toHaveLength(1);
  });

  it('blocking drops the request, blocks, and later requests never arrive', async () => {
    deps.fakes.roster.request(eve);
    await core.contacts.block('eve@x.org');
    expect(deps.fakes.roster.blocklist.has('eve@x.org')).toBe(true);
    expect(await core.contacts.requests()).toEqual([]);
    deps.fakes.roster.request(eve);
    expect(await core.contacts.requests()).toEqual([]);
  });

  it('blocking a contact also removes them from the roster', async () => {
    deps.fakes.roster.seed(contact('eve@x.org', 'Eve', 'online'));
    const seen: string[] = [];
    core.events.on('contact.updated', (c) => seen.push(c.subscription));
    await core.contacts.block('eve@x.org');
    expect(await core.contacts.list()).toEqual([]);
    expect(seen).toEqual(['none']);
  });

  it('unblocking lets a new request through', async () => {
    await core.contacts.block('eve@x.org');
    await core.contacts.unblock('eve@x.org');
    deps.fakes.roster.request(eve);
    expect(await core.contacts.requests()).toHaveLength(1);
  });

  it('refuses an invalid jid before touching the roster', async () => {
    await expect(core.contacts.accept('eve')).rejects.toThrow(/InvalidJid/);
    await expect(core.contacts.block('eve')).rejects.toThrow(/InvalidJid/);
  });
});

describe('blocked list', () => {
  it('is empty at first, then lists blocked jids sorted and bare', async () => {
    expect(await core.contacts.blocked()).toEqual([]);
    await core.contacts.block('Zed@X.org/phone');
    await core.contacts.block('eve@x.org');
    expect(await core.contacts.blocked()).toEqual(['eve@x.org', 'zed@x.org']);
  });

  it('emits contacts.blocked on block and unblock, with the whole list', async () => {
    const seen: string[][] = [];
    core.events.on('contacts.blocked', (jids) => seen.push(jids));
    await core.contacts.block('eve@x.org');
    await core.contacts.block('al@x.org');
    await core.contacts.unblock('eve@x.org');
    expect(seen).toEqual([['eve@x.org'], ['al@x.org', 'eve@x.org'], ['al@x.org']]);
    expect(await core.contacts.blocked()).toEqual(['al@x.org']);
  });

  it('stays quiet when unblocking someone who was not blocked', async () => {
    const seen: string[][] = [];
    core.events.on('contacts.blocked', (jids) => seen.push(jids));
    await core.contacts.unblock('eve@x.org');
    expect(seen).toEqual([]);
  });
});
