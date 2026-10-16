# The interface (`packages/ui`)

_Created 2026-10-15. Sources: `packages/ui/src/App.tsx`, `packages/ui/src/core/`,
`packages/ui/src/screens/`, `packages/ui/src/components/`._

The UI is React 19, TypeScript, CSS Modules, no router, no UI library. It reaches the core only
through `useCore()` (services) and `core.events`; it never imports Converse, Tauri or storage
(AGENTS.md, section 2). The desktop app renders `<App core locale onOpenLink? version? />`.

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
| Main | `screens/Main.tsx` | Three columns: `Sidebar`, `Conversation` (keyed by chat id, so drafts and in-flight loads stay with their chat; or the `EmptyState` with Postie `waving`, "Pick a chat"; or the [first-launch card](#first-launch)), optional `Details`. Owns the selected chat, the open dialog and the error sentence of background actions. Subscribes to `chat.requested` (notification click, `xmpp:` link) and opens the chat if it is not listed yet. |

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

## Empty states and first launch

_Added 2026-10-16 (decision of the author, "Night of 2026-10-16": empty states and first-launch
screens with Postie). Sources: `components/EmptyState.tsx`, `components/WelcomeCard.tsx`,
`illustrations/Postie.tsx`, `core/settings.ts`, `screens/EmptyStates.test.tsx`,
`screens/Main.test.tsx`, `components/EmptyState.test.tsx`._

Every place that can be empty shows one `EmptyState` (see [design-system.md](design-system.md#components)):
Postie in a pose, a title, one sentence in his voice, and at most one button, the one thing to do
from there. A failed load is never an empty state (`RetryNotice`).

| Where | Pose | Title | Button |
|---|---|---|---|
| `ChatList`, no chat | `writing` | No letter yet | "Start a chat" → the New chat dialog (`Sidebar` hands `onNewChat` as `onStartChat`) |
| `ContactList`, no contact | `searching` | An empty address book | "Add a contact" → the Add contact dialog (`onAddContact`) |
| `MessageList`, no letter in the open chat | `writing` | A blank page | none: the composer is right below |
| `RoomBrowser`, nothing listed on the server | `searching` | No hall here | none |
| `Main`, no chat selected | `waving` | Pick a chat | none |
| `DetailsPane`, a hall without a record | `searching` | Nothing to show | none; the pane keeps its close X (Esc works too) |

`MessageList` takes the empty state as an `empty` prop and renders it only while the list is
empty; `Conversation` passes it only once `useMessages().loaded` is true (the first page answered,
or failed), so a chat whose history is still on its way does not flash "A blank page". The sidebar
search with no match shows the same empty state as an empty list (not a separate "no result").
There is no rooms-only list in the sidebar, so "no rooms" has no state of its own: a hall with no
letter yet shows the blank page, and browsing shows "No hall here".

### First launch

After a sign-in (or a registration, which signs in) whose address book is empty, `Main` shows
`WelcomeCard` in the conversation area instead of "Pick a chat": Postie `waving`, three
lines (add a contact, join a hall, letters are sealed when the other side has a key) and "Got
it". No tour, no wizard. `Main` asks `contacts.list()` once on mount, only when the account has not
been welcomed yet; the card appears when the list comes back empty, so a full roster never flashes
it. "Got it" calls `writeWelcomed(jid)` (`core/settings.ts`, `localStorage`
`hey-postie:welcomed`, a JSON list of the welcomed JIDs, read and written under the same
`try/catch` rules as the other per-viewer choices) and the card never comes back for that account,
on this machine. Opening a chat hides it until the chat is closed; only "Got it" ends it.
Tests that are not about the first launch call `writeWelcomed('alice@x.org')` before rendering.

## Account menu

The account row of the sidebar (`components/AccountMenu.tsx`) is a button
(`aria-haspopup="menu"`) showing the account's `Avatar`, its `PresenceDot` (the chosen
`Account.presence.show`, or offline while not online) and the display name. It opens a small
card: the JID (outside the menu, it is not an item), the **presence picker** and the **status
sentence** (added 2026-10-16), and a `role="menu"` with "Sign out", "My devices…" (see
Encryption), "Settings…" (see [Settings](#settings)) and "Delete my account…". The first item takes the focus,
arrows move and wrap (from outside the items, Down goes first and Up goes last), Esc, Tab out or a
click outside closes it and the focus returns to the row. Picking an item puts the focus back on
the row **before** acting, so the dialog it opens gives the focus back to the row when it closes.
Deleting the account is therefore two clicks away, as App Store rule 5.1.1(v) asks.

The picker is a `fieldset` of three radios, "Available" / "Away" / "Do not disturb", each with
its dot; a change calls `accounts.setPresence({ show, status })` at once with the sentence in the
field. The sentence field saves on Enter with the chosen show; a counter beside it reads
`n/140` (`STATUS_MAX_LENGTH`, a mirror of the service's `MAX_STATUS_LENGTH`) and turns red past
the limit; the service's `StatusTooLong` shows as Postie's sentence under the field through
`errorKey`. Both are disabled while the account is not online (the service refuses then). The
row is fed by `useAccount()`, so the dot and the checked radio follow the `account.changed` the
service emits. Contacts have no status sentence in the contract (`Contact` carries only
`presence`), so the lists and the chat header show their dot alone.

"Delete my account…" opens `components/DeleteAccountDialog.tsx` from `Main`: a plain sentence
(no joke; it is permanent on the server), a field where the user types their own JID
(`aria-describedby` the sentence; compared trimmed and lower-cased), and a `danger` button that
stays disabled until it matches. Submit calls `accounts.deleteAccount()`; while it runs the dialog
is not closable (`Dialog closable={false}`: Esc and the X are ignored, Cancel disabled); on
success `Main` leaves to Welcome (`onLeave('welcome')`), on failure the sentence shows and the
dialog stays.

## Settings

_Added 2026-10-15; became a window with sections on 2026-10-16 (decision of the author, "Night
of 2026-10-16"). Sources: `components/settings/` (`SettingsWindow.tsx`, `SettingsNav.tsx`,
`sections.ts`, one `*Section.tsx` per section, `section.module.css`), `components/Licenses.tsx`,
`components/OwnDevices.tsx`, `core/settings.ts`, `core/useTheme.ts`, `core/SettingsProvider.tsx`,
`data/licenses.json`, `components/settings/SettingsWindow.test.tsx`, `components/Licenses.test.tsx`._

"Settings…" in the `AccountMenu` opens `SettingsWindow`, a `Dialog size="large"` (a window inside
the window, 880 × 640 at most, never past the app's minimum window of 900 × 600): the sections on
the left (`SettingsNav`), the open one on the right. No "Save": every change applies at once. The
window shows only what the core backs; a setting with nothing behind it (launch at login, sounds,
avatar, status sentence, logs) is left out rather than shown dead.

| Section | Content | Where the value lives |
|---|---|---|
| General | Language as radios "System language" / "English" / "Français" (each language named in itself, whatever the current one). | The locale handed to `CoreProvider`; remembered in `localStorage` `hey-postie:locale`. |
| Account | Display name and JID (read-only until a service can change them), whether the password is kept (`accounts.rememberedPassword`, nothing said until the keychain answers), "Sign out" and "Delete my account…" with a plain hint. | `accounts.signOut` through `Main`; delete opens `DeleteAccountDialog` **in place of** the window and comes back to it on close (focus on that button). |
| Appearance | Radios "Follow the system" / "Light" / "Dark" (`fieldset` + `legend`). | `data-theme` on `<html>` (`'light'` / `'dark'`, removed for "system": the tokens then follow `prefers-color-scheme`), remembered in `localStorage` `hey-postie:theme`. |
| Notifications | A checkbox "Show the letter in notifications" with its explanation, and a line saying a hall's bell is set in the hall's own pane. | `core.notifications.setShowPreview(value)`; remembered in `localStorage` `hey-postie:notify-preview` (`off`, or absent). |
| Privacy and encryption | `OwnDevices` with this device's fingerprint stated above the list, then how trust works (spec 3.6: blind trust, verify after comparing, own devices follow the same rule), why a stranger's picture waits for a click, and the blocked contacts (`BlockedContacts`: one sentence on what blocking does, the JIDs in monospace with "Unblock" each, "Nobody is blocked." when the list is empty). | The rules live in the core; the sentences only explain them. The blocklist is the server's: `contacts.blocked()`, refreshed on the `contacts.blocked` event, `contacts.unblock(jid)`. |
| Advanced | About: "Hey Postie <version>", the AGPL-3.0 note, "Website" and "Source code" links, a "Licenses" button. | `version` prop of `App` ("dev" when absent). Links go through `onOpenLink`. |

**Keyboard.** `SettingsNav` is a vertical `role="tablist"` (six panels: past the two-or-three
rule of the toggle buttons, see [Keyboard](#keyboard)): one Tab stop with a roving `tabindex`,
arrows move and select at once, Home and End jump to the ends, Tab then enters the panel
(`role="tabpanel"`, labelled by its tab, keyed by the section so a section mounts fresh). The
active tab takes the focus when the window opens (`data-autofocus`, read by `Dialog`); Esc closes
and the focus returns to the account row. `Main` keeps the open section, so a round trip to
Licenses or to the delete dialog comes back to the same one, with the focus on the button that
left (`returnFocus`).

**Two kinds of state.** The theme and the language are *per-viewer conveniences*: they belong to
this window, not to the account, carry nothing secret, and the core has no say in them. They are
the only things the UI keeps in `localStorage` (`core/settings.ts`: every read and write is
wrapped in `try/catch`, so a browser that refuses storage still gets the defaults; an unknown
stored value reads as the default). The notification preview is different: *whether the body
of a letter reaches the notification center* is a rule, so the switch itself lives in the core
(`NotificationsService.setShowPreview` / `getShowPreview`, `packages/core/src/services/notifications.ts`:
off, the body is the fixed `HIDDEN_PREVIEW` sentence). The UI only remembers the user's choice
in `localStorage`, under the same rules, and tells the core at startup. The core never reads
`localStorage`.

**Startup, no flash.** The desktop shell applies the stored theme before the bundle even loads:
`apps/desktop/public/theme.js`, a plain `<script src>` in `index.html` ahead of the stylesheet (no
inline script: the CSP is `script-src 'self'`), reads the same key and sets `data-theme` for
`'light'` / `'dark'` only. `App` then reads the three values synchronously in `useState`
initializers; `useTheme` applies the theme in a `useLayoutEffect`, before the browser paints, so
the React side agrees from its first frame (the tokens handle the system theme without JavaScript,
see [design-system.md](design-system.md)). The preview switch is told to the core synchronously
during the first render (a ref guard), not in an effect: a letter arriving right after render
already respects it. The locale given by the desktop (`pickLocale`) is the
"system" language; a stored choice wins over it, and a change swaps the dictionary through
`CoreProvider`, so the whole tree re-renders in the new language without a reload. The values
and their setters reach the sections through `SettingsProvider` / `useSettings()` (a context, like
`CoreProvider`), so `Main` only mounts the window.

**Licenses.** The "Licenses" button (Advanced) closes the window and opens `Licenses` in its place (no
nested dialogs: Esc has one card to close); closing it comes back to the window. It reads
`data/licenses.json`, a `{ name, version, license, repository? }[]`: today a hand-written list of
the known runtime components (placeholder versions), to be replaced by a list the desktop build
generates, of the same shape. Entries are grouped by license (alphabetical, names sorted inside),
a search field filters by name or license (the count, or the empty sentence, is announced in a
visually hidden `role="status"`), rows are keyed by `name@version`, and a name whose `repository`
starts with `https://` is a link routed through `onOpenLink` (anything else stays plain text: the
list is generated data). Coming back from Licenses puts the focus on the "Licenses" button
(`focusLicenses`, set by `Main`). Importing the JSON needs `resolveJsonModule` in `packages/ui/tsconfig.json`.

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
selection changes; `notifications.setWindowFocused` on window `focus` / `blur`. `useMessages(chat)`
(`core/useMessages.ts`, the state behind `Conversation`) marks a message read as it arrives in the
open chat only while `document.hasFocus()`, and again when the window regains focus. Messages are
merged by id (`mergeById`), so one that arrives while the history is loading is kept, and the
hook remembers the latest version each event brought (`fromEvents`): a page that lands after an
update (`messages()` or `loadOlder()` still pending) takes the event's version, never the older
snapshot. It also holds `send` (clears the chat's error on success), `retry` (sets it on
failure), `loadOlder` and `react` (`chats.toggleReaction`), so `Conversation` is layout only.
`MessageList` keeps the viewport still when an older page lands by anchoring on the message that
was first before the load (`data-message-id`) and restoring its offset once something sits above
it; a letter arriving at the bottom meanwhile does not consume the anchor. `useChats` numbers its requests so an older `list()` answer never
overwrites a newer one.

## Typing (XEP-0085)

_Added 2026-10-16. Sources: `components/Composer.tsx`, `core/useTyping.ts`,
`components/Conversation.tsx`, `core/useTyping.test.tsx`, `components/Composer.test.tsx`,
`screens/Main.test.tsx`._

Out: the `Composer` takes `onComposing(composing)` and calls it with `true` on every change that
leaves text, `false` once the draft is empty or the letter is sent; `Conversation` routes it to
`chats.setComposing(chat.id, composing)`, and the service does the throttling (one `composing`
per `COMPOSING_REPEAT_MS`, `paused` after `PAUSED_AFTER_MS`).

In: `useTyping(chatId)` collects the senders of `chat.typing` events for this chat, in the order
they started, and drops each one on `typing: false` or after `TYPING_STALE_MS` (10 s) without a
new event, so a lost `paused` never leaves the line forever (every `composing` restarts that
clock). `Conversation` writes the line just above the composer in a `<p aria-live="polite">` that
keeps its height when empty: "Bob is typing…" with the contact's name (or the chat's title) in a
direct chat, the nick (`room@service/nick`) in a hall, several names joined with a comma under
`typing.many`.

## Avatars

_Added 2026-10-16. Sources: `components/Avatar.tsx`, `components/Avatar.test.tsx`._

`Avatar` shows `avatarUrl` when there is one, else initials on a colour from the JID (see
[design-system.md](design-system.md#components)). It sits in the account row (`Account.avatarUrl`),
`ContactList` and `ChatList` rows (`ChatList` takes `contacts` to find a direct chat's picture;
a hall gets its title's initials), the `Conversation` header, `Details` (`contact` is threaded
from `Main` through `DetailsPane`) and the sender line of a hall's runs in `MessageList`. There is
no avatar upload: the contract has none.

## Letters from strangers

_Added 2026-10-16 (decision of the author, "Night of 2026-10-16": like Signal, accept / ignore /
block; nothing of a stranger's is loaded or notified until accepted). Sources:
`core/useRequests.ts`, `components/RequestList.tsx`, `MessageRequest.tsx`,
`BlockContactDialog.tsx`, `screens/Main.tsx`, `components/Sidebar.tsx`, `screens/MessageRequests.test.tsx`._

The rules live in the core: `contacts.requests()` holds the pending subscription requests (name and
sentence already sanitized), `Chat.fromStranger` marks a direct chat whose peer is not in the
address book, `Chat.isRequest` says whether that chat is a request (they wrote and this account
never did, as far as the latest page of the history shows; since 2026-10-16), the notifications
service stays silent for them and `files.autoLoad` refuses their pictures. `isRequest(chat)`
(`core/useRequests.ts`) only reads that flag: a chat the user opened with someone outside the
address book, or answered, is an ordinary chat with a composer.

- **`useRequests(chats)`**: `contacts.requests()` on mount, again on every `contact.requested` and
  `contact.updated` (accepting removes one), merged by `requestRows` with the strangers' chats
  into one row per JID (`RequestRow`: name, note, `requested`, the chat when they wrote, `at` =
  their last letter or the moment the request was first seen; the contract carries no time).
  Rows are sorted most recent first. Ignored and blocked JIDs go into a `hidden` set kept for the
  session (`hide`), since the service has no notion of "ignored" for a chat; a new
  `contact.requested` for that JID, or a new incoming letter from them, brings the row back.
  `useChats` also re-reads the list on `contact.updated`: whether a chat is a stranger's depends
  on the address book, and no `chat.updated` follows an accept.
- **Sidebar**: `RequestList` above the chats (Chats tab only): a heading button
  (`aria-expanded`, folded by default) "Letters from strangers" with the count on stamp yellow, then
  one row per stranger (name, time, their note or last letter as preview); arrows move between
  rows with `ChatList.moveWithArrows`. `ChatList` receives the chats **minus** the requests, so a
  stranger's letter never sits among the chats; the search filters both lists by name. No rows:
  no group at all (a plain absence, the empty-state illustrations are another lane's).
- **`Main`** keeps `requestJid` next to `selected`; `select(chat)` routes a chat that is a
  request (from the list, a `chat.requested` event, or `chats.open` from the "New chat" dialog or
  a contact click) to the request screen, and the screen also takes over when a stranger's
  letter lands in the chat that is open. The request's chat, when there is one, is still told to
  `notifications.setOpenChat` and `chats.markRead`.
- **`MessageRequest`**: name, JID, Postie's explanation (nothing of theirs rings or loads until
  accepted), their note as text (`<blockquote>`, React escapes it, no HTML), what accepting means,
  then three buttons, disabled while a call is in flight, a failure as a `role="alert"` sentence:
  - **Accept** → `contacts.accept(jid)`, then `Main.openWith(jid)`: the roster now holds them, so
    `chats.open` comes back without `fromStranger` and the chat opens as a normal one, listed
    among the chats.
  - **Ignore** → `contacts.ignore(jid)` only when a request is pending (declining someone who
    never asked would send a stray stanza), then `hide(jid)` and back to the empty state.
  - **Block…** → `BlockContactDialog`, the one confirmation: their name in the sentence (the
    server drops everything they send: letters, parcels, requests), Cancel and a `danger`
    "Block"; the dialog calls `contacts.block(jid)` itself, not closable in flight, a refusal keeps
    it open with Postie's sentence. Then `hide(jid)`, `requests.refresh()` and the empty state.
  - Their letters, when they wrote, sit below in the ordinary `MessageList` (`HeldLetters`,
    keyed by the chat, on `useMessages`): the existing `Attachments` path keeps a stranger's
    picture behind "Load image" (`files.autoLoad` says no). No composer: one answers after accepting.
- **Blocked contacts** (built 2026-10-16): `BlockedContacts` in Settings > Privacy and
  encryption, see [Settings](#settings). `contacts.blocked()` on mount, then the `contacts.blocked`
  event (the whole list, sorted) after every block and unblock, from this window or from the
  request screen. One "Unblock" per row (`contacts.unblock`), disabled while its call is in
  flight, a refusal as a `role="alert"` sentence under the list.

**Points to check.** A reply older than the latest page of the history is not seen by the
service, so a long-silent chat the user once answered may come back as a request; the UI follows
the flag and has no rule of its own. The Converse roster returns an empty blocklist until XEP-0191
is implemented there, so the settings list stays empty on a real account for now.

## Rooms (halls)

_Added 2026-10-15, leaving from the row added 2026-10-16. Sources: `components/JoinRoom.tsx`,
`RoomBrowser.tsx`, `RoomDetails.tsx`, `RoomRowMenu.tsx`, `LeaveRoomDialog.tsx`, `AddMenu.tsx`,
`core/useRooms.ts`, `core/useRoomMembers.ts`, `screens/Rooms.test.tsx`, `LeaveRoom.test.tsx`._

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
- **Join a hall** (`JoinRoom`, from the "+" menu): two tabs. *Address*: room JID, nick prefilled
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
  the banner alone, and neither the members button nor the contact pane: `DetailsPane` (keyed
  by the chat) renders `Details` only for `chat.kind === 'direct'` and `RoomDetails` (keyed by
  the JID) only when the hall record exists.
- **Nick completion**: `Composer` receives the members' nicks (minus my own). Tab completes the
  word before the caret into the nick it equals, else the first nick that starts with it, both
  ignoring case: `nick: ` at the start of a line, `nick ` elsewhere, and no second space when one
  already follows the caret (`completeNick`, a pure function). The caret lands after the nick and
  the textarea regrows. Shift+Tab and a word that matches nobody leave Tab to the browser.
- **RoomDetails** (right pane): topic, JID, members grouped by role (moderators, participants,
  visitors) with the affiliation as a kraft hint (owner, admin, member, banned; none is silent),
  the notify rule as three radios (`rooms.setNotify`, then `useRooms().refresh()` through
  `onChanged`, since the pane shows the rule from the hall record; a failure shows the sentence),
  and "Leave the hall", confirmed through `LeaveRoomDialog` (below); `Main` then drops the
  selection and the pane.
- **Leaving from the row** (decision of 2026-10-16: leaving must be reachable from the room row
  as well as from its details pane). A row whose hall the app has a record of (joined or
  bookmarked; `ChatList` receives `rooms` and `onLeaveRoom`) carries `RoomRowMenu`: a "⋯"
  button (`aria-haspopup="menu"`, visible on hover or focus of the row, over the time's corner)
  and a right-click on the row, both opening a `Popover` (`prefer="below"`) with a `role="menu"`
  of one item, "Leave the hall…". `ChatList` owns which row's menu is open; the "⋯" and the row
  are siblings inside the `<li>` (a button never nests in a button), and `moveWithArrows` only
  walks `button[data-row]`, so arrows skip the "⋯". Focus goes to the item on open and back to
  what opened the menu (the "⋯", or the row on a right-click) on Esc or on a click outside; Tab
  out closes it without moving the focus. Picking the item gives the focus back first, then asks
  `Main` (`onLeaveRoom` through `Sidebar`), which mounts the dialog as `leavingRoom`; after the
  service accepted, `Main` drops the selection and the pane only if the hall left is the open
  chat. A hall with no record (history of a hall left for good) and a direct chat have no menu.
- **`LeaveRoomDialog`**, the one confirmation, used by the row menu and by `RoomDetails`: titled
  "Leave the hall", a sentence with the hall's name (`room.confirmLeave`, `{name}` replaced) that
  says the bookmark goes and the letters stay on the server, Cancel and a `danger` "Leave". The
  dialog itself calls `rooms.leave(jid)` and reports through `onLeft`; while the call runs it is
  `closable={false}` with both buttons disabled; a failure keeps it open with Postie's sentence
  as a `role="alert"`.
- The sidebar badge of a hall is the **mentions count** on stamp yellow when it is above zero,
  otherwise the unread count in a muted chip.

## Encryption (Postie Seal)

_Added 2026-10-15, reworked after review the same day. Sources: `components/SealToggle.tsx`,
`DeviceList.tsx`, `EncryptionSection.tsx`, `RoomEncryption.tsx`, `MyDevices.tsx`,
`RetryNotice.tsx`, `core/useEncryption.ts`, `core/useDevices.ts`, `core/useMemberDevices.ts`,
`core/useTrustAction.ts`, `screens/Encryption.test.tsx`, `screens/Devices.test.tsx`. The rules
themselves (blind trust, when a chat can be sealed) live in the core (spec 3.6); the UI only
shows and asks._

- **The lock** (`SealToggle`, in the `Conversation` header): a `<button aria-pressed>` with the
  lucide `lock` / `lock-open` icon. `useEncryption(chat)` holds the state, and the truth is
  always the record: `chat.encrypted`, then every `chat.updated` for that chat (the service emits
  one after a `setEncryption` it accepted). The hook never flips the state itself, so a
  `chat.updated` that says otherwise after the call wins. While the call is pending the lock is
  disabled with `aria-busy`, and a second click does nothing. `EncryptionUnavailable` shows
  Postie's sentence `crypto.unavailable` ("no key on the other side") under the header, as a
  `role="alert"`; any other error shows its usual sentence.
- While sealed, the composer's hint reads "Write a sealed letter…" (`Composer`'s `sealed` prop).
  An outgoing message with `encryption: 'omemo'` carries the **wax seal** badge (`MessageBubble`,
  `.wax`): a `--red` dot at the corner of the bubble, with a hidden "Sealed" for screen readers.
- **Undecryptable** messages keep Postie's sentence and add a plain help line ("Ask them to send
  it again, or check their devices") with a "Check their devices" button, only when a pane can
  open (a direct chat, or a hall the app has a record of). The button goes up to `Main`
  (`onShowDevices` → `onOpenEncryption` → `showDetails(true)`), which opens the pane and bumps
  `encryptionFocus`, a request counter: the Encryption section focuses itself and scrolls into
  view on every new value, so a second request re-focuses too. The header toggle resets it to 0.
- **Loading devices**: `useDevices(jid)` loads `crypto.devices(jid)` and then takes the
  `devices.changed` payload for that address; a new address empties the list at once, only the
  latest request may set it, and an event arriving during the load wins over the load (the
  request is cancelled). `useOwnDevices()` re-reads `crypto.ownDevices()` on every
  `devices.changed`, since the service does not say which address is mine. `useMemberDevices`
  loads several addresses at once (a hall) and says when all have answered. A failed load is an
  **error state**: `RetryNotice` shows Postie's sentence with "Retry" (`reload`), never the
  "no key" sentence. `Main` keys `Details` by `chat.id` (and `RoomDetails` by the hall's JID), so
  switching chats with the pane open never shows the previous peer's devices.
- **Devices of a contact** (`EncryptionSection`, in `Details`): `DeviceList` renders one
  focusable `<li>` per device: the fingerprint through `crypto.formatFingerprint` in a `<code>`,
  the **trust stamp** (Untrusted / Trusted / Verified / Blocked), and the actions the trust
  allows: Verify and Block when untrusted or trusted, Block when verified, Unblock when blocked
  (Block needs no confirmation: it is reversible). Every button is `aria-describedby` its row's
  `<code>`, so a screen reader hears the fingerprint after the verb while the visible label stays
  short. `useTrustAction` calls `crypto.verify / block / unblock`, one call at a time; the list
  itself updates through `devices.changed`, never locally, and once the service answered the
  **row takes the focus** (its buttons just changed). A hint asks to compare fingerprints in
  person before verifying. No device: "No key on the other side yet."
- **Devices in a hall** (`RoomEncryption`, in `RoomDetails`): the same list, grouped by member,
  for the members whose `jid` the hall reveals (non-anonymous halls). Emptiness is decided from
  the loaded lists: known members without any device show Postie's "no key" sentence, not the
  hint; nothing shows while the lists are still being read.
- **My devices** (`OwnDevices`): the list and its confirmation, shown in the `MyDevices` `Dialog`
  (the "My devices…" item of the `AccountMenu`, `onMyDevices` through `Sidebar` to `Main`) and in
  the Privacy section of the settings window (`withFingerprint`: this device's fingerprint stated
  above the list). "Remove" replaces the list by a
  confirmation in place (no nested dialogs: Esc has one card to close), then
  `crypto.removeOwnDevice(id)`, one call at a time. Focus follows: the confirm button when asked,
  back to that row's "Remove" on cancel (or on a failure), the list once a device is gone. A
  `devices.changed` that no longer lists the device being confirmed drops the confirmation. The
  row whose id is `crypto.ownDeviceId()` wears a "This device" stamp and has no "Remove": a
  device does not retire itself from here (no row is marked until the service has answered).

## Parcels (Postie Parcel)

_Added 2026-10-15. Sources: `core/useUploads.ts`, `core/useAttachment.ts`, `core/useFileDrop.ts`,
`core/download.ts`, `components/PendingParcel.tsx`, `DropOverlay.tsx`, `Attachments.tsx`,
`InlineImage.tsx`, `ParcelCard.tsx`, `Lightbox.tsx`, `i18n/bytes.ts`, `components/Parcels.test.tsx`,
`Attachments.test.tsx`. The rules (size limit, encryption, which images are inline) live in the
core's `files` service; the UI only shows and asks._

- **Three ways in**: the paperclip of the `Composer` (a visually hidden `<input type="file"
  multiple>` labelled "Attach a parcel", the button is its visible face), files dropped on the
  conversation (`useFileDrop(onFiles, enabled)`: only drags that carry `Files` are taken, an
  enter/leave depth counter so crossing a child does not blink the `DropOverlay` with Postie
  `delivering` and "Drop your parcel here"; with `enabled` false, outside a hall, nothing is
  prevented and no overlay shows), and an image pasted in the composer (`pastedImages`: only
  `image/*` files; the default is prevented only when the clipboard carries no text, so text that
  came with the picture still lands in the letter).
- **On their way** (`useUploads()`, held by `Main` above the conversations so that switching
  chats neither loses an upload in flight nor hides a refusal; `Conversation` receives
  `uploads.forChat(chat.id)`): every file becomes an `Upload` and a call to
  `files.send(chatId, file, onProgress)`. A `PendingParcel` bubble (navy, like an outgoing letter)
  shows the name, the size (`formatBytes`, `Intl.NumberFormat` with `style: 'unit'`) and a
  `role="progressbar"` labelled "Sending <name>" until the service hands back the message: the
  upload keeps it as `sent`, and the chat's `Conversation` (now or when it is opened again) puts
  it in its list through `useMessages.add` and dismisses the bubble. Pending bubbles render as the `footer` of
  `MessageList`, inside the scroller, so they sit under the last message and the list stays
  pinned to the bottom. `FileTooLarge` keeps the bubble with the sentence and the limit
  (`files.maxFileSize()` formatted: "The server takes up to 5 MB."), and only "Dismiss": a heavier
  parcel will not get lighter. Any other error shows its sentence with "Retry" (the same `File`
  again) and "Dismiss"; the sentence alone is the `role="alert"`, the buttons sit beside it.
- **Received** (`Attachments`, in `MessageBubble`; a message that is a parcel alone has no body
  line): `files.isInlineImage(att)` decides between `InlineImage` and `ParcelCard`, and
  `files.autoLoad(message)` whether a picture may be fetched without a click (our own letters,
  contacts in the roster). From anyone else the picture waits as a `ParcelCard` with a "Load
  image" button, since fetching a stranger's URL would tell them when the chat was opened; a click
  turns it into the inline image. Nothing shows until the service has answered. The raw URL
  never reaches an `<img src>`: `useAttachment(att)` asks `files.fetch` (which decrypts an
  `aesgcm` parcel), makes an object URL, revokes it on unmount, re-fetches only when `url`,
  `encryption` or `decryptionKey` change (a `message.updated` for a reaction brings a new
  `Attachment` object for the same bytes, and an open lightbox survives it), and exposes `loading` (a kraft
  skeleton, `role="status"`), `ready` or `error` ("I could not fetch this parcel." with Retry,
  through `RetryNotice`). A sealed parcel wears a small lock badge ("Sealed parcel"). A click on the
  picture opens `Lightbox`, a `Dialog` titled with the file name (so Esc, the focus trap and the
  focus return come for free) with the image and "Save". `ParcelCard` fetches nothing until
  "Save": then `files.fetch`, and the bytes go to `onSaveFile(blob, name)`.
- `onSaveFile` is a prop of `App`, drilled like `onOpenLink` (`Main` → `Conversation` →
  `MessageList` → `MessageBubble` → `Attachments`). Default: `downloadBlob` (an anchor with
  `download`, the object URL revoked a minute later); the desktop app routes it to a native save
  dialog.

## Emoji

_Added 2026-10-15. Sources: `scripts/trim-emoji.mjs`, `data/emoji.json`, `data/emoji.ts`,
`components/Popover.tsx`, `EmojiPicker.tsx`, `composerText.ts`, `EmojiPicker.test.tsx`._

- **Data**: `packages/ui/src/data/emoji.json` (149 kB, 1589 entries) is generated from Converse's
  `emoji.json` (the one `apps/desktop/public/` serves to the engine) by
  `node packages/ui/scripts/trim-emoji.mjs`, which keeps `{ category, emoji, shortname, keywords }`
  (the `emoji` string is built from the `cp` code points; `keywords` are Converse's alternate
  shortnames) and drops the custom images, the bare skin-tone modifiers and the `_toneN` variants
  (they would multiply "People" by six). The generated file is committed; the UI never fetches the
  desktop's copy. `data/emoji.ts` types it, lists the categories in the picker's order and holds
  `searchEmojis(query)` (shortname or keyword contains the query, spaces read as `_`) and the six
  `QUICK_EMOJIS` of the reaction row. Nothing new is installed: see
  [dependencies.md](dependencies.md) for Converse.
- **Popover** (`Popover`): a `role="dialog"` card with `position: fixed`, placed above its
  `anchor` (below when there is no room, clamped to the viewport; `prefer="below"` tries the
  other way round first, for a menu under a row), so neither the message
  scroller nor the composer clips it, and re-placed on every scroll (capture phase on the
  document) and window resize. Esc, heard at the document level wherever the focus is, and a
  click outside call `onClose`; the opener gives the focus back. Decision of 2026-10-15: no portal, no library; a fixed card measured once on mount
  is enough for a desktop window.
- **Picker** (`EmojiPicker`): a search field that takes the focus on open, category toggle
  buttons (`aria-pressed`, hidden while searching), then a grid of `<button>`s whose content is
  the emoji and whose accessible name is the shortname. The grid is one Tab stop (roving
  `tabindex`: the active cell at 0, the others at -1); arrows move in the grid by one or by
  `COLUMNS` (8, matching the stylesheet); Down from the search enters the grid; Esc closes. The
  smile button of the `Composer` opens it; a pick runs `insertAt` on the textarea's selection,
  closes the picker and focuses the text with the caret after the emoji (the same
  `requestAnimationFrame` dance as the nick completion). `:short` autocompletion is not built.

## Reactions

_Added 2026-10-15. Sources: `components/ReactionBar.tsx`, `Reactions.tsx`, `core/useMessages.ts`,
`components/Reactions.test.tsx`._

- Every bubble that is not `pending` has a hover / focus toolbar with one button, "React"
  (lucide `smile-plus`), at the top corner away from the edge. It opens a `Popover` with the
  `QUICK_EMOJIS` row (each button named by its shortname, the first one takes the focus) and
  "More emojis" (the whole `EmojiPicker`). Picking calls
  `chats.toggleReaction(chat.id, message.id, emoji)` through `useMessages.react`, closes and gives
  the focus back to "React"; an error shows as the conversation's sentence.
- The pills (`Reactions`, a `<ul aria-label="Reactions">`) show each emoji with its count as a
  toggle button: `aria-label` "👍 2", `aria-pressed` when `reaction.mine` (set by the repository,
  which alone knows the occupant JID the account reacts under in a hall; the UI never compares
  `fromJids` with the account JID), `title` with the local parts of who reacted
  (`alice, bob`; in a hall the nick after the `/`). A click toggles that emoji. Nothing is patched
  locally: the row changes when `message.updated` brings the message back.

## Keyboard

Cmd/Ctrl+K focuses the search (listener in `Main`). The "+" of the sidebar opens a menu
(`AddMenu`, `role="menu"`): focus lands on the first item, arrow keys cycle, Esc, Tab out, a
click outside or picking an item closes it. Picking an item puts the focus back on "+" before
the dialog opens, so the dialog gives the focus back to "+" when it closes. The account row opens
`AccountMenu` with the same keyboard rules (focus back on the row), and a room row's "⋯" or a
right-click opens `RoomRowMenu` with the same rules again (see [Rooms](#rooms-halls)). Esc closes the open
dialog (`Dialog` listens in the capture phase and stops the event there, so a confirmation over
the details pane closes alone; it also traps Tab inside the card and gives the focus back to the
opener) or, when no dialog is open, the details pane (listener in `Main`).

**Toggle buttons as tabs.** The sidebar's "Chats" / "Contacts" and the join dialog's "Address" /
"Browse" are plain `<button aria-pressed>` elements, not a `role="tablist"`: two buttons that
swap one panel do not need the tab keyboard model (arrow keys, roving tabindex), and a pressed
button is announced as such by screen readers. Decision of 2026-10-15; revisit if a screen grows
past two or three panels. The settings window, with six sections, is the one real `tablist`
(see [Settings](#settings)). Enter in the composer sends, except while an
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
outside, focus back on the row before acting, presence radios and the status sentence sent to
the fake, counter and `StatusTooLong` sentence, picker off while offline), `Avatar.test.tsx`
(picture with empty alt, initials hidden from readers on the JID's tone, two initials at most),
`core/useTyping.test.tsx` (only this chat's senders, gone on paused, gone after 10 s with the
clock restarted by each event, fake timers), `settings/SettingsWindow.test.tsx` (six tabs with the
focus on General, arrows / Home / End move and select with one Tab stop, Esc back to the row,
account name and JID with the password line, sign out from the window, delete dialog in place and
back with the focus on its button, own devices with this device's fingerprint and a removal,
the AGPL note, both links through `onOpenLink`; and the former Settings tests: theme radios set `data-theme`
and persist, stored theme applied on the first render, unknown value ignored, storage refusing,
preview switch hides the body through the fake notifier and persists, stored choice respected by
a letter arriving right after render, storage `getItem` throwing, language switch re-renders at once with own-language labels, stored language at
startup, version or "dev", repository link through `onOpenLink`, Licenses in place of Settings and
back with the focus on "Licenses"), `Licenses.test.tsx` (every entry under its license, filter by
name or license with the empty sentence, live count, two versions of one name and https-only
links, link through `onOpenLink`, grouping and sorting), `EmptyState.test.tsx` (title, sentence, illustration and action; no button without an action),
`EmptyStates.test.tsx` ("Start a chat" and "Add a contact" open their dialogs, the blank page in a
chat with no letter and no button, "No hall here" when browsing finds nothing, "Nothing to show"
in the pane of a hall without a record and its close X), `DeleteAccountDialog.test.tsx`
(two clicks away, button asleep until the JID matches, `deleteCurrent` recorded and Welcome
shown, failure sentence, not closable while deleting, Esc with focus back on the row), `ChatList.test.tsx` (empty state with Postie and no button, "Start a chat" when handed, order, badge, sealed preview),
`MessageList.test.tsx` (grouping, day labels, retry, undecryptable, links, load older),
`Composer.test.tsx` (Enter / Shift+Enter, empty disabled, inline error),
`MessageRequests.test.tsx` (the group with the count and the rows most recent first, a stranger
out of the chat list, the request screen with the note and the letters held, no composer and no
bell, accept → roster and a normal chat among the chats, ignore → declined and put away until a
new request, block with the confirmation (Cancel first) → blocklist and a later request dropped,
no group when nobody is at the door), `Main.test.tsx`
(Postie waving with a full roster, the welcome card on an empty roster shown once then never for
that account but still for another, markRead and notification rules, new chat dialog, contacts, sign out through the
account menu),
`LeaveRoom.test.tsx` ("More" only on a hall row, the menu with the focus on its item, right-click,
Esc back to the row, confirmation with the name → `rooms.leave` and the selection dropped, Esc on
the confirmation with the focus back on "More", a refusal keeps the card with the sentence, arrows
skip the "⋯"), `LeaveRoomDialog.test.tsx` (the sentence with the name, Cancel calls nothing, Leave
→ service and `onLeft`, a refusal keeps the card and re-enables, not closable while in flight),
`Rooms.test.tsx` (join by address, password field on `RoomPasswordRequired`, `NickTaken`
sentence, focus back to "+", room service discovery, bad domain sentence, browse and pick,
sender nick and mention highlight, Tab completion with the caret, outside a hall and "Join
again", a room chat without a hall record, members by role and notify radios, Esc on the leave
confirmation, leave with confirmation, a fresh hall on top, mentions badge),
`Encryption.test.tsx` (the lock seals through the service and the composer hint follows, pending
lock with `aria-busy` and a double click, `chat.updated` wins after the call, the no-key
sentence, devices with formatted fingerprints and stamps, Verify / Block / Unblock through
`devices.changed` with the focus on the row, failed load with Retry, no stale devices after a
chat switch, an event during the load wins, the wax badge, undecryptable help line and the way
to the devices twice, no way when no pane can open), `Devices.test.tsx` (My devices with "This
device", confirm / cancel / remove with the focus following, confirmation dropped when the device
goes away, failed load with Retry; a hall's devices by member, known members without any key),
`Parcels.test.tsx` (attach through the input → `uploaded` and the card, the pending bubble with
its progress, the too-heavy sentence with the limit and no Retry, Retry on another failure, drop
with the overlay and the depth counter, drags left alone outside a hall, an image paste taken and
a text paste left alone with its default), `Uploads.test.tsx` (an upload in flight and a refusal
survive a chat switch), `Attachments.test.tsx` (a stranger's picture waits for "Load image" and
fetches nothing before, no such button on a PDF, a sealed inline image from a contact in the
roster from the fetched blob with a mocked `URL.createObjectURL`, the raw URL in no attribute of the DOM, lightbox and Save, one fetch
per parcel and the lightbox kept through a reaction, the object URL revoked on unmount, fetch
failure with Retry, a file card whose Save fetches), `useMessages.test.tsx` (an update during the
first load and during an older page wins), `MessageList.test.tsx` also (the scroll anchor holds
through a letter arriving mid-load), `Popover.test.tsx` (placement follows a scroll, clicks
inside and on the anchor keep it), `EmojiPicker.test.tsx` (focus on the search, shortname and keyword filtering,
categories, insertion at the caret with the focus back on the text, one Tab stop and arrows in
the grid, Esc with the focus back on the smile, click outside), `Reactions.test.tsx` (quick row →
service call and my pressed pill with the names in `title`, toggling off from the pill, "More
emojis" → picker, focus on the first quick emoji and Esc from anywhere, the row's label).
