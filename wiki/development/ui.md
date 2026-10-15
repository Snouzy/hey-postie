# The interface (`packages/ui`)

_Created 2026-10-15. Sources: `packages/ui/src/App.tsx`, `packages/ui/src/core/`,
`packages/ui/src/screens/`, `packages/ui/src/components/`._

The UI is React 19, TypeScript, CSS Modules, no router, no UI library. It reaches the core only
through `useCore()` (services) and `core.events`; it never imports Converse, Tauri or storage
(AGENTS.md, section 2). The desktop app renders `<App core locale onOpenLink? />`.

## Screens and the state machine

`App.tsx` holds the whole routing in one component, `Screens`:

| Account state (`useAccount()`) | User's own click | Screen |
|---|---|---|
| `null`, `offline`, `error` | none yet, or "Back" | `Welcome` |
| `null`, `offline`, `error`, `connecting` | "Sign in" | `SignIn` |
| `online` | any | `Main` |

Two inputs, so two pieces of state: the account from the core, and a `door` (`'welcome' |
'signIn'`) that the user's clicks move. `Main` calls `onSignedOut` after `accounts.signOut()`
so the door goes back to `welcome`. Errors while connecting keep the user on `SignIn`, where Postie
`oops` says the sentence for the error code (`i18n/errors.ts` maps a `DomainError` code to
`error.<Code>`, falling back to `error.Unknown`).

| Screen | File | What it does |
|---|---|---|
| Welcome | `screens/Welcome.tsx` | Postie `happy`, "Sign in", "Create an account" (not wired yet). |
| Sign in | `screens/SignIn.tsx` | JID, password, "Remember me". On blur of a valid-looking JID, asks `accounts.rememberedPassword` and prefills. While `connecting`: Postie `delivering`, form disabled. |
| Main | `screens/Main.tsx` | Three columns: `Sidebar`, `Conversation` (or the empty state with Postie `asleep`), optional `Details`. Owns the selected chat and the open dialog. |

## How the UI subscribes to the core

Three hooks in `packages/ui/src/core/`, all built on `core.events.on`, which returns the
unsubscribe function:

- `useAccount()`: `useSyncExternalStore` over `account.changed`, snapshot `accounts.current()`.
  Drives the routing.
- `useCoreEvent(event, handler)`: `useEffect` subscription that always calls the latest handler,
  so components do not have to memoize. Used for `message.received`, `message.updated`.
- `useChats()` and `useContacts()`: fetch the list on mount and fetch it **again** on every
  `chat.updated` / `contact.updated`, rather than patching locally. The order on screen is
  therefore always the one the service defines (`chats.list()` sorts by last activity,
  `contacts.list()` by presence then name). `useChats` also exposes `refresh()` for the one case
  with no event: opening a chat that is not in the list yet.

What `Main` tells the core: `notifications.setOpenChat(id)` and `chats.markRead(id)` when the
selection changes; `notifications.setWindowFocused` on window `focus` / `blur`. `Conversation`
marks a message read as it arrives in the open chat.

## Keyboard

Cmd/Ctrl+K focuses the search (listener in `Main`). Esc closes the open dialog (listener in
`Dialog`) or, when no dialog is open, the details pane (listener in `Main`). Arrow keys move
between rows of the chat list (`ChatList.moveWithArrows`). Every control is a `<button>`,
`<input>` or `<a>`, so Tab reaches it; `:focus-visible` is styled once in `tokens.css`.

## Links in messages

`Linkify` turns `http(s)://` and `xmpp:` URLs into anchors with `rel="noreferrer"`; the click is
prevented and handed to `onOpenLink`, which `App` receives as a prop (default: `window.open`).
The desktop app will route it to the system browser. Nothing else in a body becomes clickable,
and bodies are always rendered as text (no HTML).

## Adding a screen

1. Create `screens/<Name>.tsx` and `screens/<Name>.module.css`; read data through `useCore()`
   and the hooks above, never through a repository.
2. Add its texts to **both** `i18n/en.ts` and `i18n/fr.ts` (`i18n/index.test.ts` fails otherwise).
3. Add a row to the table in `Screens` (`App.tsx`): which account state and which user action show it.
4. Write its test with `createCore(createFakeDependencies())` (`test-utils.tsx` has `setupCore`,
   `renderWithCore` and a `message()` builder) and drive the fakes (`deps.fakes.chat.receive`,
   `deps.fakes.xmpp.failWith`, ...).
5. Update this page and, for a new component, the components table in
   [design-system.md](design-system.md), in the same commit.

## Tests

`pnpm --filter @hey-postie/ui test` (Vitest, Testing Library, jsdom). What they cover, checked on
2026-10-15: `SignIn.test.tsx` (invalid JID never reaches `xmpp.connect`, wrong password sentence,
success goes to Main, password prefill), `ChatList.test.tsx` (order, badge, sealed preview),
`MessageList.test.tsx` (grouping, day labels, retry, undecryptable, links, load older),
`Composer.test.tsx` (Enter / Shift+Enter, empty disabled, inline error), `Main.test.tsx`
(empty state, markRead and notification rules, new chat dialog, contacts, sign out).
