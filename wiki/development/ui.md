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
| no | any | "Create an account" | `CreateAccount` |
| yes | any (`connecting`, `offline`, `error` show a banner) | any | `Main` |

Three inputs: the account from the core, a `door` (`'welcome' | 'signIn' | 'createAccount'`) that
the user's clicks move, and `inside`, set the first time the account is `online` (a created
account is signed in by `accounts.register`, so it enters Main through the same path). Once inside, `Main` stays mounted
through reconnections and drops: the sidebar shows "I am back on the bike" while `connecting`,
and an offline banner with "Sign in again" on `offline` / `error`. Only a sign out, from `Main`
(`onLeave('welcome' | 'signIn')`), leaves it. Errors while first connecting keep the user on
`SignIn`, where Postie `oops` says the sentence for the error code (`i18n/errors.ts` is a
`Record<ErrorCode, MessageKey>`, so a new code in the contracts fails the build until it has its
sentence).

| Screen | File | What it does |
|---|---|---|
| Welcome | `screens/Welcome.tsx` | Postie `happy`, "Sign in", "Create an account". |
| Sign in | `screens/SignIn.tsx` | JID, password, "Remember me"; an optional `prefill` (JID and sentence) when coming from account creation. On blur of a valid-looking JID, asks `accounts.rememberedPassword` and prefills. While `connecting`: Postie `delivering`, form disabled. |
| Create account | `screens/CreateAccount.tsx`, `screens/RegistrationForm.tsx` | Two steps, see [Create account](#create-account) below. |
| Main | `screens/Main.tsx` | Three columns: `Sidebar`, `Conversation` (keyed by chat id, so drafts and in-flight loads stay with their chat; or the empty state with Postie `asleep`), optional `Details`. Owns the selected chat, the open dialog and the error sentence of background actions. Subscribes to `chat.requested` (notification click, `xmpp:` link) and opens the chat if it is not listed yet. |

## Create account

Two steps on one screen, both with Postie above the card (`delivering` while waiting for the
server, `oops` on an error, `sealed` otherwise) and the focus in the first field.

1. **"Where?"** (`CreateAccount.tsx`): a server field with a short sentence by Postie
   (`aria-describedby`) and a link to the public directory `https://providers.xmpp.net`, opened
   through `onOpenLink` with `rel="noreferrer"`. No server is listed in the app: we do not vouch
   for any. "Continue" calls `accounts.registrationForm(domain)`. `RegistrationUnsupported`,
   `ServerUnreachable` and `CertificateInvalid` keep the user here with their sentence and the
   button reads "Try another server".
2. **"Who?"** (`RegistrationForm.tsx`): the `RegistrationForm` from the core, rendered
   generically. Every visible field becomes a `Field` (our own labels for `username` and
   `password`, the server's `label` for the rest; `required` enforced; the server's
   `instructions` shown as Postie's sentence with the domain). The input type never comes from
   the server: `password` is always `type="password"`, `email` stays `email`, everything else is
   `text`. `hidden` fields are not shown and not sent: filling them is the repository's business.
   We add "Repeat password" (must match) and require `MIN_PASSWORD_LENGTH` characters (exported
   by the core, so the rule is written once), both checked before anything leaves the screen.
   The CAPTCHA image is shown only when `captchaImageDataUrl` starts with `data:image/` (the core
   already filters; the UI keeps its own belt), with its answer field named after `captchaField`.
   Submit calls `accounts.register({ domain, username, password, extra })`, where `extra` holds
   the other values **of this form only** (email, CAPTCHA answer, custom fields); a `busy` flag
   disables the form and ignores a second submit while the first is in flight. `AccountConflict`
   puts the focus back on the username; `AccountCreatedSignInFailed` (the account exists but the
   sign-in that follows failed) hands over to `SignIn` with the JID prefilled and that sentence
   shown (`App` keeps the JID in `createdJid`; "Sign in" from Welcome clears it); other errors
   show their sentence. Any edit clears the sentence, on both steps. Success signs in, so `App`
   moves to Main on its own.

The typed values live in `CreateAccount`, so "Back" from "Who?" to "Where?" and "Continue" again
lose nothing (the domain is kept too); "Back" from "Where?" goes to Welcome.

## Account menu

The account row of the sidebar (`components/AccountMenu.tsx`) is a button
(`aria-haspopup="menu"`) that opens a small card: the JID (outside the menu, it is not an item)
and a `role="menu"` with "Sign out" and "Delete my account…". The first item takes the focus,
arrows move and wrap (from outside the items, Down goes first and Up goes last), Esc, Tab out or a
click outside closes it and the focus returns to the row. Picking an item puts the focus back on
the row **before** acting, so the dialog it opens gives the focus back to the row when it closes.
Deleting the account is therefore two clicks away, as App Store rule 5.1.1(v) asks.

"Delete my account…" opens `components/DeleteAccountDialog.tsx` from `Main`: a plain sentence
(no joke; it is permanent on the server), a field where the user types their own JID
(`aria-describedby` the sentence; compared trimmed and lower-cased), and a `danger` button that
stays disabled until it matches. Submit calls `accounts.deleteAccount()`; on success `Main`
leaves to Welcome (`onLeave('welcome')`), on failure the sentence shows and the dialog stays.

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

## Rooms (halls)

_Added 2026-10-15. Sources: `components/JoinRoom.tsx`, `RoomBrowser.tsx`, `RoomDetails.tsx`,
`AddMenu.tsx`, `core/useRooms.ts`, `core/useRoomMembers.ts`, `screens/Rooms.test.tsx`._

A hall is a chat with `kind: 'room'`: its messages arrive through the same `chats` /
`message.received` path, with `fromNick` and `isMention` set by the repository. The UI keeps one
list of rows for the sidebar, built by `withRooms(chats, rooms)` (`core/useRooms.ts`): every
chat whose id is a hall's JID takes the hall's name and kind, and a hall with no message yet (just
joined) gets a row of its own at the top of the list (`roomChat`). `rooms.list()` is therefore
the source of truth for which rows are halls; `chat.kind` from the service is honoured too. JIDs
are bare and lowercase from the core, so rows and halls are matched as-is.

- `useRooms()`: `rooms.list()` on mount and on every `room.updated`, kept to the halls that are
  joined or bookmarked; same request counter as `useChats`.
- `useRoomMembers(jid)`: `rooms.members(jid)` on mount and on every `room.members` for that JID.
  An empty JID (a direct chat) asks nothing.
- **Join a room** (`JoinRoom`, from the "+" menu): two tabs. *Address*: room JID, nick prefilled
  with the account's local part, and a password field that appears only once the service
  answers `RoomPasswordRequired`. *Browse* (`RoomBrowser`): a domain prefilled with what
  `rooms.roomService(accountDomain)` discovers, or `rooms.<account domain>` when it finds
  nothing; "Look up" → `rooms.browse(domain)` (an `InvalidJid` reads as the `joinRoom.badDomain`
  sentence and empties the list), then a list of `RoomInfo` (name, JID, members count); a click
  fills the address and returns to the first tab. Submit → `rooms.join`; errors are Postie's
  sentence inline; on success `Main` selects the hall. The only rule the dialog applies itself
  is that its fields are not empty; JIDs, nicks and domains are validated by the service.
- **Conversation** of a hall: the topic next to the name (one line, the full text in `title`),
  a "Members" button instead of "Details" that toggles `RoomDetails`, the sender's nick above
  each run of incoming messages (`MessageList showSenders`), and a **mention highlight**: a
  bubble with `isMention` gets a soft `--yellow` background, a yellow left border and a visually
  hidden "Mentions you" (`MessageBubble.mention`).
- **Outside a hall**: a room chat whose hall is not joined shows Postie's "I am not in this hall
  right now" on a kraft banner and a disabled composer. When the hall is still known (bookmarked,
  left elsewhere, kicked) the banner offers "Join again" → `rooms.join` with the stored nick,
  errors inline. A room chat with no hall record at all (history of a hall left for good) shows
  the banner alone, and neither the members button nor the contact pane: `Main` renders
  `Details` only for `chat.kind === 'direct'` and `RoomDetails` (keyed by the JID) only when the
  hall record exists.
- **Nick completion**: `Composer` receives the members' nicks (minus my own). Tab completes the
  word before the caret into the nick it equals, else the first nick that starts with it, both
  ignoring case: `nick: ` at the start of a line, `nick ` elsewhere, and no second space when one
  already follows the caret (`completeNick`, a pure function). The caret lands after the nick and
  the textarea regrows. Shift+Tab and a word that matches nobody leave Tab to the browser.
- **RoomDetails** (right pane): topic, JID, members grouped by role (moderators, participants,
  visitors) with the affiliation as a kraft hint (owner, admin, member, banned; none is silent),
  the notify rule as three radios (`rooms.setNotify`, then `useRooms().refresh()` through
  `onChanged`, since the pane shows the rule from the hall record; a failure shows the sentence),
  and "Leave the hall", confirmed through `Dialog` → `rooms.leave`; `Main` then drops the
  selection and the pane.
- The sidebar badge of a hall is the **mentions count** on stamp yellow when it is above zero,
  otherwise the unread count in a muted chip.

## Keyboard

Cmd/Ctrl+K focuses the search (listener in `Main`). The "+" of the sidebar opens a menu
(`AddMenu`, `role="menu"`): focus lands on the first item, arrow keys cycle, Esc, Tab out, a
click outside or picking an item closes it. Picking an item puts the focus back on "+" before
the dialog opens, so the dialog gives the focus back to "+" when it closes. The account row opens
`AccountMenu` with the same keyboard rules (focus back on the row). Esc closes the open
dialog (`Dialog` listens in the capture phase and stops the event there, so a confirmation over
the details pane closes alone; it also traps Tab inside the card and gives the focus back to the
opener) or, when no dialog is open, the details pane (listener in `Main`).

**Toggle buttons as tabs.** The sidebar's "Chats" / "Contacts" and the join dialog's "Address" /
"Browse" are plain `<button aria-pressed>` elements, not a `role="tablist"`: two buttons that
swap one panel do not need the tab keyboard model (arrow keys, roving tabindex), and a pressed
button is announced as such by screen readers. Decision of 2026-10-15; revisit if a screen grows
past two or three panels. Enter in the composer sends, except while an
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
success goes to Main, password prefill), `CreateAccount.test.tsx` (directory link through
`onOpenLink`, server without registration stays on "Where?", unreachable server, seeded form with
email, hidden field and CAPTCHA, mismatched and short passwords never reach `registration.submit`,
conflict focuses the username, success sends `extra` and lands in Main, back links, one
`register` for a double submit, hand-over to Sign in on `AccountCreatedSignInFailed`, password
field type never from the server, CAPTCHA only from a data URL, errors clear on edit, the
password never appears in the document, values kept across Back, only the current form's fields
sent),
`AccountMenu.test.tsx` (JID outside the menu, arrows incl. Up from outside, Esc, Tab out, click
outside, focus back on the row before acting), `DeleteAccountDialog.test.tsx`
(two clicks away, button asleep until the JID matches, `deleteCurrent` recorded and Welcome
shown, failure sentence, Esc), `ChatList.test.tsx` (order, badge, sealed preview),
`MessageList.test.tsx` (grouping, day labels, retry, undecryptable, links, load older),
`Composer.test.tsx` (Enter / Shift+Enter, empty disabled, inline error), `Main.test.tsx`
(empty state, markRead and notification rules, new chat dialog, contacts, sign out through the
account menu),
`Rooms.test.tsx` (join by address, password field on `RoomPasswordRequired`, `NickTaken`
sentence, focus back to "+", room service discovery, bad domain sentence, browse and pick,
sender nick and mention highlight, Tab completion with the caret, outside a hall and "Join
again", a room chat without a hall record, members by role and notify radios, Esc on the leave
confirmation, leave with confirmation, a fresh hall on top, mentions badge).
