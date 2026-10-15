# The interface (`packages/ui`)

_Created 2026-10-15. Sources: `packages/ui/src/App.tsx`, `packages/ui/src/core/`,
`packages/ui/src/screens/`, `packages/ui/src/components/`._

The UI is React 19, TypeScript, CSS Modules, no router, no UI library. It reaches the core only
through `useCore()` (services) and `core.events`; it never imports Converse, Tauri or storage
(AGENTS.md, section 2). The desktop app renders `<App core locale onOpenLink? />`.

## Screens and the state machine

`App.tsx` holds the whole routing in one component, `Screens`:

| Has been online in this session | Account state (`useAccount()`) | User's own click | Screen |
|---|---|---|---|
| no | `null`, `offline`, `error` | none yet, or "Back" | `Welcome` |
| no | any | "Sign in" | `SignIn` |
| yes | any (`connecting`, `offline`, `error` show a banner) | any | `Main` |

Three inputs: the account from the core, a `door` (`'welcome' | 'signIn'`) that the user's clicks
move, and `inside`, set the first time the account is `online`. Once inside, `Main` stays mounted
through reconnections and drops: the sidebar shows "I am back on the bike" while `connecting`,
and an offline banner with "Sign in again" on `offline` / `error`. Only a sign out, from `Main`
(`onLeave('welcome' | 'signIn')`), leaves it. Errors while first connecting keep the user on
`SignIn`, where Postie `oops` says the sentence for the error code (`i18n/errors.ts` is a
`Record<ErrorCode, MessageKey>`, so a new code in the contracts fails the build until it has its
sentence).

| Screen | File | What it does |
|---|---|---|
| Welcome | `screens/Welcome.tsx` | Postie `happy`, "Sign in", "Create an account" (not wired yet). |
| Sign in | `screens/SignIn.tsx` | JID, password, "Remember me". On blur of a valid-looking JID, asks `accounts.rememberedPassword` and prefills. While `connecting`: Postie `delivering`, form disabled. |
| Main | `screens/Main.tsx` | Three columns: `Sidebar`, `Conversation` (keyed by chat id, so drafts and in-flight loads stay with their chat; or the empty state with Postie `asleep`), optional `Details`. Owns the selected chat, the open dialog and the error sentence of background actions. Subscribes to `chat.requested` (notification click, `xmpp:` link) and opens the chat if it is not listed yet. |

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
marks a message read as it arrives in the open chat only while `document.hasFocus()`, and again
when the window regains focus. Messages are merged by id (`mergeById`), so one that arrives while
the history is loading is kept. `useChats` numbers its requests so an older `list()` answer never
overwrites a newer one.

## Keyboard

Cmd/Ctrl+K focuses the search (listener in `Main`). Esc closes the open dialog (listener in
`Dialog`, which also traps Tab inside the card and gives the focus back to the opener) or, when no
dialog is open, the details pane (listener in `Main`). Enter in the composer sends, except while an
IME is composing (`isComposing`). Arrow keys move
between rows of the chat list (`ChatList.moveWithArrows`). Every control is a `<button>`,
`<input>` or `<a>`, so Tab reaches it; `:focus-visible` is styled once in `tokens.css`.

## Links in messages

`Linkify` turns `http(s)://` and `xmpp:` URLs into anchors with `rel="noreferrer"` (trailing
punctuation is left out of the link); the click is prevented. A web link goes to `onOpenLink`,
which `App` receives as a prop (default: `window.open`); the desktop app will route it to the
system browser. An `xmpp:` link stays in the app: `Linkify` emits `chat.requested` with the bare
JID and `Main` opens that chat. Nothing else in a body becomes clickable,
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
