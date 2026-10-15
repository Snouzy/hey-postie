# Patterns

Every pattern used in the code is explained here: what it is, why we use it, where it lives, and a
short example. A pattern that is not on this page does not go in the code (see [AGENTS.md](../../AGENTS.md)).

Keep each entry short enough for a junior developer to read in two minutes.

Checked against the code on 2026-10-15 (`packages/core`, milestone 0).

## Three layers

**What.** Every feature is cut into presentation (what the user sees), service (business rules)
and persistence (how data is stored or fetched). A layer only calls the layer directly below it.

**Why.** The UI must survive a change of XMPP engine or transport, and the business rules must be
testable without a network, a keychain or a browser. Keeping the rules in one layer also keeps them
findable: when sign-in misbehaves, there is one file to read.

**Where.**

| Layer | Code |
|---|---|
| Presentation | `packages/ui/`, `apps/desktop/app/` |
| Service | `packages/core/src/services/` (`accounts.ts`, `jid.ts`, `events.ts`) |
| Persistence | `packages/core/src/repositories/` (milestone 1), `packages/core/src/fakes/` for tests |

The shared vocabulary between layers lives in `packages/core/src/contracts/`: plain types
(`types.ts`), `DomainError` (`errors.ts`), event names (`events.ts`), repository interfaces
(`repositories.ts`) and service interfaces (`services.ts`).

**Example.** The sign-in rule in `packages/core/src/services/accounts.ts`: validation, the
keychain decision and error translation are the service's job; the repositories only move data.

```ts
async signIn({ jid, password, remember }) {
  const normalized = normalizeJid(jid);                 // rule: validate before any network call
  current = { jid: normalized, displayName: ..., state: 'connecting' };
  events.emit('account.changed', current);              // the UI reacts to events, not to internals
  if (remember) await rememberQuietly(deps.keychain, normalized, password);
  const websocketUrl = await deps.transport.websocketUrlFor(domainOf(normalized));
  try {
    await deps.xmpp.connect({ jid: normalized, password, websocketUrl });
  } catch (error) {                                      // technical error -> domain error
    const domainError = error instanceof DomainError ? error : new DomainError('Unknown', undefined, error);
    update({ state: 'error', error: domainError });
    throw domainError;
  }
  ...
}
```

## Repositories behind interfaces, fakes in tests

**What.** A service never imports a concrete repository. It receives objects that satisfy the
interfaces of `packages/core/src/contracts/repositories.ts` (`KeychainRepository`,
`TransportRepository`, `XmppRepository`, `Notifier`). Tests pass in-memory fakes from
`packages/core/src/fakes/`; the desktop app passes Tauri-backed implementations.

**Why.** Unit tests for business rules then run in milliseconds, with no keychain, no server and no
flakiness, and they can simulate conditions that are hard to reproduce for real (a keychain that is
unavailable, a server that rejects the password). The fake is also the executable description of
what a real repository must do: same methods, same errors (`DomainError('KeychainUnavailable')`),
same ordering. This is the one place where an interface with a single production implementation is
allowed on purpose (AGENTS.md, section 2).

**Where.** Interfaces: `packages/core/src/contracts/repositories.ts`. Fakes:
`packages/core/src/fakes/{keychain,transport,xmpp,notifier}.ts`, assembled by
`createFakeDependencies()` in `packages/core/src/fakes/index.ts`, which returns the dependencies
plus a `fakes` field typed as the concrete classes so a test can configure and inspect them.

**Example.** `packages/core/src/fakes/keychain.ts` and its use in
`packages/core/src/services/accounts.test.ts`:

```ts
export class FakeKeychain implements KeychainRepository {
  unavailable = false;                                   // flip to simulate Linux without Secret Service
  private readonly store = new Map<string, string>();
  async get(jid: string) { this.check(); return this.store.get(jid) ?? null; }
  async set(jid: string, password: string) { this.check(); this.store.set(jid, password); }
  async delete(jid: string) { this.check(); this.store.delete(jid); }
  private check() { if (this.unavailable) throw new DomainError('KeychainUnavailable'); }
}

// in the test
deps.fakes.keychain.unavailable = true;
const account = await core.accounts.signIn({ jid: 'a@b.org', password: 'pw', remember: true });
expect(account.state).toBe('online');                    // sign-in still works, password just not kept
```

## The container as the single wiring point

**What.** `createCore(deps)` in `packages/core/src/container.ts` is the only function that
constructs services and hands them their repositories and the event bus. It returns the `Core`
object (`accounts`, `events`) that the UI consumes. Nothing else in the code base calls
`createAccountsService` or `createEventBus`.

**Why.** With a single wiring point, the dependency graph is readable in one short file, swapping
an implementation is a one-line change at the call site (`createCore(createFakeDependencies())`
in tests, `createCore(createTauriDependencies())` in the desktop app), and a service can never
quietly `new` a repository of its own. It is plain function calls: no framework, no decorators, no
reflection.

**Where.** `packages/core/src/container.ts` (`CoreDependencies`, `createCore`). Call sites:
`packages/core/src/services/accounts.test.ts`, and `apps/desktop/app/main.tsx` once Task 4 lands.

**Example.** The whole container today:

```ts
export interface CoreDependencies {
  keychain: KeychainRepository;
  transport: TransportRepository;
  xmpp: XmppRepository;
  notifier: Notifier;
}

export function createCore(deps: CoreDependencies): Core {
  const events = createEventBus();
  const accounts = createAccountsService(deps, events);
  return { accounts, events };
}
```

Adding a service means: its interface in `contracts/services.ts`, its factory in `services/`, one
line here, and the field on `Core`.
