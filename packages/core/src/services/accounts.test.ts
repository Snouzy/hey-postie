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

describe('accounts.signIn, transport failure', () => {
  it('ends in the error state instead of staying connecting', async () => {
    deps.fakes.transport.failWith = new DomainError('ServerUnreachable');
    const core = createCore(deps);
    await expect(
      core.accounts.signIn({ jid: 'a@b.org', password: 'pw', remember: false }),
    ).rejects.toThrow(/ServerUnreachable/);
    expect(core.accounts.current()?.state).toBe('error');
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

  it('emits account.changed with the offline state', async () => {
    const core = createCore(deps);
    await core.accounts.signIn({ jid: 'a@b.org', password: 'pw', remember: false });
    const seen: string[] = [];
    core.events.on('account.changed', (a) => seen.push(a.state));
    await core.accounts.signOut();
    expect(seen.at(-1)).toBe('offline');
  });
});

describe('accounts.register', () => {
  const form = { domain: 'b.org', fields: [] };

  it('asks the form through the relay url of the domain', async () => {
    deps.fakes.registration.forms.set('b.org', form);
    const core = createCore(deps);
    expect(await core.accounts.registrationForm(' B.org ')).toEqual(form);
  });

  it('reports a server without registration', async () => {
    const core = createCore(deps);
    await expect(core.accounts.registrationForm('b.org')).rejects.toThrow(
      /RegistrationUnsupported/,
    );
  });

  it('submits, then signs in and remembers the password', async () => {
    const core = createCore(deps);
    const account = await core.accounts.register({
      domain: 'B.org',
      username: ' Alice ',
      password: 'longenough',
    });
    expect(deps.fakes.registration.submitted).toEqual([
      { domain: 'b.org', values: { username: 'alice', password: 'longenough' } },
    ]);
    expect(account.state).toBe('online');
    expect(await deps.fakes.keychain.get('alice@b.org')).toBe('longenough');
  });

  it('refuses a short password before talking to the server', async () => {
    const core = createCore(deps);
    await expect(
      core.accounts.register({ domain: 'b.org', username: 'alice', password: 'short' }),
    ).rejects.toThrow(/RegistrationRejected/);
    expect(deps.fakes.registration.submitted).toEqual([]);
  });

  it('passes a taken name through as AccountConflict', async () => {
    deps.fakes.registration.taken.add('alice@b.org');
    const core = createCore(deps);
    await expect(
      core.accounts.register({ domain: 'b.org', username: 'alice', password: 'longenough' }),
    ).rejects.toThrow(/AccountConflict/);
  });
});

describe('accounts.deleteAccount', () => {
  it('deletes on the server, wipes local data and the keychain, signs out', async () => {
    const core = createCore(deps);
    await core.accounts.signIn({ jid: 'a@b.org', password: 'pw', remember: true });
    deps.fakes.registration.currentJid = 'a@b.org';
    const states: string[] = [];
    core.events.on('account.changed', (a) => states.push(a.state));
    await core.accounts.deleteAccount();
    expect(deps.fakes.registration.deleted).toEqual(['a@b.org']);
    expect(deps.fakes.registration.wiped).toEqual(['a@b.org']);
    expect(await deps.fakes.keychain.get('a@b.org')).toBeNull();
    expect(core.accounts.current()).toBeNull();
    expect(states.at(-1)).toBe('offline');
  });

  it('refuses when nobody is signed in', async () => {
    const core = createCore(deps);
    await expect(core.accounts.deleteAccount()).rejects.toThrow(/Unknown/);
  });
});
