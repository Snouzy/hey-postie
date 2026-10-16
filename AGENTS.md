# Rules for every agent and developer

Read this file before writing any code, then [wiki/index.md](wiki/index.md) and
[wiki/rules.md](wiki/rules.md). It applies to Claude, every other AI agent, and humans.
Many AI sessions work on this repository in parallel: these rules keep their work compatible.

## 1. Keep It Stupid Simple

Write the simplest code that works, is maintainable and can be reused. The test: in six months, any
developer (the author, a junior, or an AI) must understand it without asking anyone.

- Patterns are welcome, but only when they solve a problem we actually have, and only once they are
  understood and documented. Every pattern used in the repo is explained in
  [`wiki/development/patterns.md`](wiki/development/patterns.md), with the reason it exists. A pattern
  that is not in that page does not go in the code.
- No speculative abstraction: no interface with a single implementation "for later", no generic
  helper for one caller, no configuration nobody asked for. Exception: the boundaries listed in
  section 2, which exist on purpose.
- Clear names over comments. A comment explains *why*, never *what*.
- Short functions, short files. A file that grows past ~300 lines is a sign it does two things.

## 2. Architecture: three layers, always

Every feature is split into three layers. A layer only calls the layer directly below it.

| Layer | Contains | Where |
|---|---|---|
| **Presentation** | What the user sees: React components, screens, hooks that format data for display, texts (i18n). No business rule, no XMPP, no storage. | `packages/ui`, `apps/*` |
| **Service** | Business code: rules, authorization, validation, sanitizing of incoming content, technical error handling and translation into domain errors, logging. Exposes plain data and events. | `packages/core/src/services/` |
| **Persistence** | Data access: repositories over the XMPP engine (`@converse/headless`), local storage (IndexedDB), the OS keychain (through Tauri). Knows *how* data is stored or fetched, never *why*. | `packages/core/src/repositories/` |

- **The UI never imports `@converse/headless`, Tauri APIs or storage directly.** It talks to services
  only. This is what lets us replace the engine or the transport without touching the UI.
- Services depend on repository **interfaces** (contracts), not on their implementations: they are
  wired in one place (`packages/core/src/container.ts`). Tests replace repositories with fakes.
- Contracts (types, service and repository interfaces) live in `packages/core/src/contracts/`.
- The Rust side of `apps/desktop` (transport, keychain, notifications, tray) is persistence /
  infrastructure: it is reached through a repository, never from a React component.

## 3. SOLID, applied simply

- **Single responsibility**: one module, one reason to change. `MessageService` does not upload files.
- **Open/closed**: add a feature by adding a module, not by adding `if` branches to an existing one.
- **Liskov substitution**: a fake repository in tests behaves like the real one (same errors, same
  ordering guarantees).
- **Interface segregation**: small, focused interfaces (`MessageReader`, `MessageSender`), not one
  `XmppRepository` with forty methods.
- **Dependency inversion**: services receive their repositories as parameters; they never `new`
  them or import a concrete implementation.

When SOLID and KISS disagree, KISS wins outside the boundaries of section 2.

## 4. Style and naming

- TypeScript: strict mode, no `any` (use `unknown` and narrow). `camelCase` for variables and
  functions, `PascalCase` for types, classes and React components, `UPPER_SNAKE_CASE` for constants.
  One component per file, file named after it (`ChatList.tsx`).
- Rust: `rustfmt` and `clippy` clean, `snake_case`, errors through `Result`, no `unwrap()` outside tests.
- Formatting and linting are enforced by the tools (`pnpm lint`, `cargo fmt`, `cargo clippy`); do not
  argue with them in code review.
- Code, comments, wiki, commits and pull requests are in English. User-facing texts live in the i18n
  dictionaries (French and English).

## 5. DRY, and nothing useless

- Do not duplicate logic: if two places need it, it belongs in a service or a shared util, once.
- But do not merge two things that only *look* alike today: duplication is cheaper than the wrong
  abstraction.
- Delete dead code, unused exports, commented-out code, obsolete files. Git keeps the history.

## 6. Privacy and security (a messenger, with end-to-end encryption)

- **Never log** message bodies, file contents, passwords, tokens, OMEMO keys or fingerprints. Log
  identifiers and event types only.
- Incoming content is untrusted: sanitize it in the service layer. No `dangerouslySetInnerHTML`.
- Secrets go to the OS keychain, never to `localStorage`, files or logs.
- Every new dependency is a decision: record it (name, license, why) in the spec of the feature.
  Licenses must be compatible with AGPL-3.0 and with app-store distribution.

## 7. Working with many AI sessions in parallel

- **One task = one branch = one git worktree.** Never two sessions in the same working tree.
  Worktrees live in `.claude/worktrees/` (ignored by git).
- **Spec before code.** A feature starts from its spec in `wiki/specs/`. Execution plans for agents
  live in `tasks/` (untracked).
- **Contracts first.** When a feature changes a contract (`packages/core/src/contracts/`), that change
  goes in its own small pull request, merged first. Parallel sessions then build on the merged
  contract. Two sessions never edit the same contract at the same time.
- **Stay in your lane.** A session only touches the modules its task names. If it needs a change
  elsewhere, it stops and says so instead of editing another session's area.
- **Dependencies one at a time.** Only one session at a time adds or upgrades dependencies, to avoid
  lockfile conflicts.
- **Small pull requests**, rebased on `main` often.
- **Delete a branch once it is merged.** As soon as it is in `main`, delete it on GitHub and locally,
  with its worktree. First check that it is in `main`: `git merge-base --is-ancestor <branch>
  origin/main`. Then `git push origin --delete <branch>`, `git worktree remove <path>` and
  `git branch -D <branch>` (`-d` compares with the branch checked out, not with `main`, so it refuses
  a merged branch). Only the session that owns the branch deletes it.
- **Verified before done.** `pnpm verify` (types, lint, tests, build) passes locally before a task is
  called finished. Every service has unit tests against fake repositories. There is no CI for now
  (decision of 2026-10-15: speed first); the local run is the gate.
- **Docs in the same commit.** A code change updates its wiki page in the same commit.
- **Commits and pushes**: each commit and each push needs the author's explicit go-ahead. Work
  happens on branches. A push to `main` is allowed only when the author approves that very push
  (decision of 2026-10-16), and never with `--force`.
- **Lessons.** After a correction from the author, add the pattern to `tasks/lessons.md` so the next
  session does not repeat it.
