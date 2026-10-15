import { beforeEach, describe, expect, it } from 'vitest';
import { createCore } from '../container';
import { DomainError } from '../contracts/errors';
import { createFakeDependencies } from '../fakes';

let deps: ReturnType<typeof createFakeDependencies>;
beforeEach(() => {
  deps = createFakeDependencies();
});

describe('accounts.signIn', () => {
  it('connects with the normalized jid and the relay url of its domain', async () => {
    const core = createCore(deps);
    const account = await core.accounts.signIn({
      jid: ' Alice@Example.org ',
      password: 'pw',
      remember: false,
    });
    expect(account.jid).toBe('alice@example.org');
    expect(account.state).toBe('online');
    expect(deps.fakes.xmpp.lastConnect).toEqual({
      jid: 'alice@example.org',
      password: 'pw',
      websocketUrl: 'ws://fake/example.org',
    });
  });
  it('stores the password only when remember is true', async () => {
    const core = createCore(deps);
    await core.accounts.signIn({ jid: 'a@b.org', password: 'pw', remember: false });
    expect(await deps.fakes.keychain.get('a@b.org')).toBeNull();
    await core.accounts.signIn({ jid: 'a@b.org', password: 'pw', remember: true });
    expect(await deps.fakes.keychain.get('a@b.org')).toBe('pw');
  });
  it('refuses an invalid jid without touching the network', async () => {
    const core = createCore(deps);
    await expect(
      core.accounts.signIn({ jid: 'alice', password: 'pw', remember: false }),
    ).rejects.toThrow(/InvalidJid/);
    expect(deps.fakes.xmpp.lastConnect).toBeNull();
  });
  it('turns a connection failure into the account error and emits account.changed', async () => {
    deps.fakes.xmpp.failWith = new DomainError('InvalidCredentials');
    const core = createCore(deps);
    const seen: string[] = [];
    core.events.on('account.changed', (a) => seen.push(a.state));
    await expect(
      core.accounts.signIn({ jid: 'a@b.org', password: 'bad', remember: false }),
    ).rejects.toThrow(/InvalidCredentials/);
    expect(core.accounts.current()?.state).toBe('error');
    expect(seen).toEqual(['connecting', 'error']);
  });
  it('still signs in when the keychain is unavailable', async () => {
    deps.fakes.keychain.unavailable = true;
    const core = createCore(deps);
    const account = await core.accounts.signIn({ jid: 'a@b.org', password: 'pw', remember: true });
    expect(account.state).toBe('online');
  });
});

describe('accounts.signOut', () => {
  it('disconnects and clears the current account', async () => {
    const core = createCore(deps);
    await core.accounts.signIn({ jid: 'a@b.org', password: 'pw', remember: false });
    await core.accounts.signOut();
    expect(core.accounts.current()).toBeNull();
    expect(deps.fakes.xmpp.connected).toBe(false);
  });
});
