# Design system "Postal"

_Created 2026-10-15. Source: `packages/ui/src/theme/tokens.css`, `fonts.css`, `packages/ui/src/illustrations/Postie.tsx`._

## Tokens

Defined on `:root` in `tokens.css`. The dark values apply under `prefers-color-scheme: dark`
unless `data-theme="light"` is set on `<html>`, and always under `data-theme="dark"`. The theme is
therefore right on first paint, with no JavaScript (spec 4.2; Review Focus 5 of the milestone 0 plan).
The user's choice (Settings > Appearance) sets or removes that attribute (`core/useTheme.ts`, see
[ui.md](ui.md#settings)).

| Token | Light | Dark | Use |
|---|---|---|---|
| `--paper` | `#F7F2E8` | `#171A22` | Window background (cream envelope) |
| `--paper-raised` | `#FFFDF8` | `#20242F` | Cards, incoming bubbles |
| `--ink` | `#1E2230` | `#EEE9DD` | Text |
| `--ink-muted` | `#5B6272` | `#A9A496` | Secondary text |
| `--navy` | `#1F3A68` | `#8FB0E8` | Primary actions, outgoing bubbles, Postie's uniform |
| `--navy-contrast` | `#FFFFFF` | `#0F1A2E` | Text on navy |
| `--red` | `#B82B16` | `#F07A66` | Mailbox red: wax seal, destructive actions, errors (light darkened 2026-10-16: 4.8:1 on `--kraft-soft`, where the banners put it) |
| `--kraft` | `#B98A4E` | `#D9B27C` | Satchel, attachment cards: **fills and borders only** |
| `--kraft-ink` | `#8B6430` | `#D9B27C` | Kraft as text or icon (affiliation hints, parcel icons, the lock badge, an avatar tone): the fill colour reads at 2.8:1 on paper, this one at 4.8:1 (added 2026-10-16) |
| `--yellow` | `#F2C14E` | same | Stamp yellow: highlights, badges |
| `--on-yellow` | `#1E2230` | same | Ink on the stamp: stays dark because the yellow does |
| `--success`, `--warning` | `#2E7D4F`, `#A35900` | `#62C489`, `#E6A04C` | Statuses (dark values added 2026-10-16: the light ones read at 3:1 on dark paper, under the 4.5:1 a trust stamp needs) |
| `--line` | 12% ink | 14% ink | Separators, card borders, the muted unread chip |
| `--line-strong` | 50% ink | 40% ink | The border of a text field (3:1 against its paper, WCAG 1.4.11; `--line` reads at 1.3:1) |

Spacing: `--space-1` (4px) to `--space-12` (48px). Radii: `--radius-sm` 8, `--radius` 12,
`--radius-bubble` 16. Fonts: `--font-heading` Fraunces, `--font-text` Figtree, `--font-mono`.
Reduced motion disables every animation and transition.

## Fonts

Fraunces (variable, OFL) for headings and Postie's sentences, with `SOFT 100` for the rounder
cut; Figtree (variable, OFL) for text. Bundled in `packages/ui/src/theme/fonts/` with their
licenses, never loaded from the network.

## Postie

`<Postie mood label size />`. Five moods: `happy` (welcome), `delivering` (sending, loading),
`sealed` (encryption, wax seal in hand), `oops` (errors, never mocking), `asleep` (offline). Three
empty-state poses, added 2026-10-16: `waving` (nothing selected, the first-launch card),
`searching` (magnifying glass: no contact, no hall found, nothing to show in a pane), `writing`
(pen over a blank letter: no chat yet, no letter in a chat). `label` comes from the dictionary
keys `postie.alt.<mood>`. Version 1 ships line-art
placeholders; an illustrator later, with these moods and props (cap, satchel, bike) as the brief.

Illustrations are SVG React components in `packages/ui/src/illustrations/`, colored with the tokens
so that they follow the theme.

## Voice

First person, short sentences, nods to postal life. Never a joke in an error. Both languages in
`packages/ui/src/i18n/`; every key exists in `en.ts` and `fr.ts` (a test checks it).

## Components

_Checked on 2026-10-15. Sources: `packages/ui/src/components/`, one `.module.css` per component,
tokens only, no hard-coded color._ Motion goes only through `var(--motion)` / `var(--motion-fast)`.

| Component | Rule |
|---|---|
| `EmptyState` | A place with nothing in it yet (added 2026-10-16): Postie in the fitting pose (an `illustration` slot), a title in the heading font, one muted sentence, and at most one `primary` pill. `compact` (default) for a sidebar list or a dialog, 96px Postie; `full` fills a column, 22px title. Never for a failed load: that is `RetryNotice`. Used by `ChatList`, `ContactList`, `RoomBrowser`, `MessageList` (through `Conversation`), `DetailsPane` and `Main`. |
| `WelcomeCard` | The first-launch card, in the conversation area of `Main`: a raised card (`--paper-raised`, `--line` border, `--shadow-card`, 420px) with Postie `waving`, "Welcome aboard" in `--navy`, three lines with a `--kraft-ink` lucide icon each (add a contact, join a hall, sealed letters) and a `primary` "Got it". Shown once per account, see [ui.md](ui.md#first-launch). |
| `Button` | One component, four variants: `primary` (navy fill), `secondary` (navy outline), `ghost` (icon buttons, no border), `danger` (red outline, destructive actions). Pill shaped. |
| `Field` | Label always visible above the input; placeholders are hints, never labels. A helper sentence goes in a `<p>` the input points to with `aria-describedby` (see `CreateAccount`). |
| `Dialog` | A raised card on a dimmed backdrop, `role="dialog"`, `aria-modal`, titled; focus goes to the first field (else the card), Tab cycles inside, everything outside the card is `inert` meanwhile, Esc and the X close it and the focus returns to the opener. Never taller than the window: the card scrolls. `closable={false}` while an action is in flight: Esc and the X are ignored (the X is disabled). Small: one form, two buttons. Destructive actions (remove a contact) confirm through it. `size="large"` (the settings): 880 × 640 at most, its children lay out the inside. An element marked `data-autofocus` takes the focus on open instead of the first field. |
| `Avatar` | A round stamp, 32px by default (`size`): the `<img>` with `alt=""` when `avatarUrl` is set (the name is always written beside it), else up to two initials in 700 at 40% of the size, hidden from readers, on a 24% `color-mix` of the person's tone with `--paper-raised` and the tone as ink. The tone comes from a hash of the JID over `--navy`, `--kraft`, `--success`, `--warning`, `--red`, so a person keeps one colour everywhere and in both themes. |
| `PresenceDot` | 10px dot: `--success` online, `--warning` away, `--red` dnd, `--ink-muted` offline. The name is in `title` and `aria-label`. |
| `ChatList` | Empty: `EmptyState` with Postie `writing` and "Start a chat" (the sidebar hands `onStartChat`). Rows: an `Avatar` (36px) then two lines: title, one-line preview, time (today: hour; else: short date), unread **badge** on `--yellow` with dark ink. A hall shows the `users` icon before its title (with a hidden "Hall" for screen readers); its badge is the mentions count on yellow, or the plain unread count in a muted chip (`--line`, text in `--ink`). The selected row has a navy bar on the left. A hall row with a record carries `RoomRowMenu`; while the row is hovered or focused its time hides under the "⋯". |
| `RoomRowMenu` | The "⋯" of a hall row (lucide `ellipsis`, 28px, `--paper-raised`, over the top-right corner, shown on hover, focus or while open) and its `Popover` below the row: a `role="menu"` card with one item, "Leave the hall…" (lucide `door-open`) in `--red`, the same item styling as `AccountMenu`. A right-click on the row opens it too. |
| `LeaveRoomDialog` | The one confirmation before leaving a hall, from the row menu and from `RoomDetails`: a plain sentence with the hall's name (bookmark forgotten, letters kept on the server), Cancel and "Leave" in `danger`; Postie's sentence in `--red` and the heading font on a refusal; not closable while the service answers. |
| `ContactList` | Grouped under presence headings, in the service's order; each row an `Avatar` (28px), the dot and the name. Empty: `EmptyState` with Postie `searching` and "Add a contact". |
| `RequestList` | The "Letters from strangers" group above the chats: a heading button in the uppercase style of `ContactList`, a chevron for its folded state and the count on `--yellow` (a stranger at the door is worth a look); rows like `ChatList` (name, time, their note or last letter as the preview), the selected one with the navy bar. Absent when nobody is at the door. |
| `MessageRequest` | The request screen in place of a conversation: the stranger's card on `--kraft-soft` (name, JID, Postie's explanation, their note quoted on `--paper` with a `--line` left border, never in Postie's font, what accepting means in muted heading font), then "Accept" in `primary`, "Ignore", "Block…" in `danger`. Their letters sit below under an uppercase "Letters held at the door" heading, in the ordinary `MessageList`, with no composer. |
| `BlockContactDialog` | The one confirmation before blocking someone: a sentence with their name (the server drops everything they send), the JID muted below, Cancel and "Block" in `danger`; Postie's sentence in `--red` on a refusal; not closable while the service answers. |
| `MessageList` | Empty (first page answered, nothing in it): `EmptyState` `full` with Postie `writing`, "A blank page", no button. Grouped by day (sticky pill separator: "Today", "Yesterday", or the long date in the locale) then by consecutive sender. In a hall, the sender's nick sits above each run of incoming messages, small and muted, with a 20px `Avatar` before it. |
| `Attachments`, `InlineImage`, `ParcelCard` | The parcels of a message, under the body. A picture under the inline limit is shown as an `<img>` from an object URL (max 320px tall, `--radius-sm`, `cursor: zoom-in`), with a kraft **skeleton** (shimmer, still under reduced motion) while it loads and `RetryNotice` when it fails; an `aesgcm` parcel wears a 12px lock on `--kraft-ink` at its corner. Any other file is a **parcel card**: `--kraft-soft` background with a faint `--kraft` border, the type's lucide icon in `--kraft-ink` (image, music, film, file-text, file-archive, file), the name in 600 and the size in `--ink-muted` 12px, and a small "Save" pill; a picture from someone outside the address book adds a `primary` "Load image" pill before it. |
| `PendingParcel` | A parcel on its way: an outgoing (navy) bubble holding a kraft card with a `package` icon, the name, the size and a 4px **progress bar** (`--kraft` track, `--navy` fill, `role="progressbar"`). On failure Postie's sentence in the heading font with "Retry" (`danger`, on `--paper-raised`) and a "Dismiss" X. |
| `Lightbox` | A `Dialog` titled with the file name: the picture up to 70vh, "Save" as `primary`. |
| `DropOverlay` | Over the conversation while files hover it: `--paper` at 88% with a 3px dashed `--kraft` border, Postie `delivering` (120px) and "Drop your parcel here" in the heading font. `pointer-events: none` so the drop reaches the column. |
| `Popover` | A floating card for pickers, quick rows and row menus: `--paper-raised`, `--line` border, `--radius`, `--shadow-card`, `position: fixed` next to its opener (above by default, below with `prefer="below"`; re-placed on scroll and resize), `role="dialog"`. |
| `EmojiPicker` | 320px wide: a pill search field, category toggle buttons with the navy underline of the sidebar tabs, then an 8-column grid of 22px emojis (240px tall, scrolls) on `--paper` when hovered or focused. Empty: Postie's sentence in the heading font. |
| `ReactionBar` | The "React" ghost button of a bubble's hover toolbar (on `--paper-raised`, `--line` border, `--shadow-card`, so it reads on both bubbles); its popover is a row of six 32px emojis and a `smile-plus` "More emojis". |
| `Reactions` | **Pills** under the bubble: `--paper-raised` with a `--line` border, 999px radius, the emoji then the count in 600 12px; mine (`aria-pressed`) has a `--navy` border on a 30% `--yellow` mix. Hover: navy border. |
| `MessageBubble` | **Bubbles**: incoming on `--paper-raised`, bottom-left corner tighter; outgoing on `--navy` with `--navy-contrast` text, bottom-right corner tighter. Time at the bottom, visible on the last bubble of a run and on hover. **Stamps** (outgoing only), in `--navy-contrast` on the bubble: pending clock, sent one check, delivered double check. Read and failed sit on a small `--paper-raised` chip so they stand out on navy in both themes: read in `--ink`, failed in `--red`, with a "Retry" button. An `undecryptable` message shows Postie's sentence in the heading font with the **wax seal** (a `--red` stamp icon), never an empty bubble, then a plain muted help line with a small "Check their devices" button. An outgoing `omemo` message wears the **wax badge**: a 10px `--red` dot with a 2px `--paper` ring at the top-right corner of the bubble, hidden "Sealed" text for screen readers. A **mention** (`isMention`, incoming) sits on a soft mix of `--yellow` and `--paper-raised` with a 3px `--yellow` left border and a visually hidden "Mentions you". |
| `Linkify` | Bodies are text; only `http(s)://` and `xmpp:` become links, `rel="noreferrer"`, routed through `onOpenLink`. |
| `Composer` | Above it, one italic 13px `--ink-muted` line that keeps its height, `aria-live="polite"`: "<name> is typing…". Paperclip (attach) and smile (emoji picker) as 40px `ghost` buttons on the left, then the auto-growing textarea (max 200px), Enter sends, Shift+Enter breaks the line, Tab completes a member's nick in a hall, an image paste leaves as a parcel, send button disabled while empty, the whole thing disabled outside a hall (a kraft banner above it says so, with "Join again" when the hall is known); the hint reads "Write a sealed letter…" while the chat is sealed; errors from the service inline in red, in Postie's voice. |
| `SealToggle` | The lock in the conversation header: a `ghost` button with `aria-pressed`, lucide `lock-open` in ink when open, `lock` in `--red` (wax) when the chat is sealed; disabled with `aria-busy` while the service answers. The no-key sentence shows under the header in Postie's voice. |
| `DeviceList` | A `<ul>` of devices: the fingerprint in `--font-mono` 12px, groups of eight; the **trust stamp**, a small uppercase 11px label with a 1px border in its own color: `--ink-muted` untrusted, `--navy` trusted, `--success` verified, `--red` blocked; then the actions as small pills (Verify `secondary`, Block / Unblock / Remove `danger`), each `aria-describedby` the row's fingerprint. Rows are focusable: the focus lands on the row once an action is done. |
| `EncryptionSection`, `RoomEncryption` | The "Encryption" part of a details pane: the same uppercase heading as the members, a muted hint to compare in person, then the `DeviceList` (in a hall: one list per member, under the nick). Empty: Postie's sentence in the heading font. The section is focusable (`tabindex=-1`) so a sealed letter can send the reader to it. |
| `OwnDevices` | A muted hint, then my own devices in a `DeviceList` with "Remove"; the device in use wears a `--success` "This device" stamp instead of the button. The confirmation (sentence, fingerprint, Cancel / Remove in `danger`) replaces the list in place. Shown by `MyDevices` (a `Dialog` of its own) and by the Privacy section of the settings window, there with this device's fingerprint in `--font-mono` above. |
| `DetailsPane` | Picks `Details` for a direct chat or `RoomDetails` for a hall with a record, keyed by the chat. For a hall without a record: a 280px pane with the close X and an `EmptyState` (Postie `searching`, "Nothing to show"). |
| `RetryNotice` | A failed load: Postie's sentence in the heading font and `--red`, with a small "Retry" pill beside it. Never confused with an empty state. |
| `Details` | Right pane, 280px: the `Avatar` (40px) beside the name, the peer's JID in monospace, the Encryption section, and the destructive action in `danger`. |
| `AccountMenu` | The account row of the sidebar: `Avatar`, presence dot, display name, chevron; a button with `aria-haspopup="menu"`. Opens a raised card with the JID in monospace, the presence picker (three radios with `accent-color: var(--navy)`, each with its dot: Available, Away, Do not disturb), the status field on `--paper` with an 11px tabular counter `n/140` (`--red` past the limit) and Postie's sentence in `--red` on a refusal, a `--line` rule, then a `role="menu"` of four `menuitem`s, "Sign out", "My devices…" (lucide `key-round`), "Settings…" (lucide `settings`) and "Delete my account…" in `--red`. Focus on the first item, arrows wrap, Esc, Tab out and a click outside close it and the focus returns to the row. |
| `BlockedContacts` | The blocked addresses in the Privacy section of the settings window: a muted 13px hint on what blocking does, then a `<ul>` with one JID per row in `--font-mono` 12px and a small "Unblock" pill (`secondary`, named with the JID for screen readers, disabled while the service answers) on the right; "Nobody is blocked." in the heading font when the list is empty; a refusal as Postie's sentence in `--red`. |
| `SettingsWindow` | A large `Dialog`: a 200px nav column (`SettingsNav`, a vertical `tablist` of six tabs with a lucide icon each, the selected one on `--kraft-soft` in `--navy` and semibold, a `--line` rule on its right) and a scrolling panel. Each section (`components/settings/*Section.tsx`) is a 22px title then groups under the same uppercase muted heading as `RoomDetails`: radios and checkboxes with `accent-color: var(--navy)`, muted 13px hints, JID and version in `--font-mono`, links in `--navy`, `secondary` pills for actions and `danger` for "Delete my account…". No "Save": every change applies at once. |
| `Licenses` | A `Dialog`: a muted intro sentence, a `Field` search, then a 320px scrollable list of groups (license as the uppercase heading, names as `--navy` links or plain text, versions in `--font-mono` muted). Nothing found: Postie's sentence in the heading font. |
| `DeleteAccountDialog` | A `Dialog` for the one irreversible action: a plain sentence (no joke), a field where the user types their own JID, a `danger` button disabled until it matches, Postie's sentence below while deleting or on failure. |
| `RoomDetails` | The right pane of a hall: topic, JID, members under role headings (same uppercase heading as `ContactList`) with the affiliation in `--kraft-ink`, the Encryption section (members' devices, grouped by nick), the notify rule as radios with `accent-color: var(--navy)`, "Leave the hall" in `danger` confirmed through `LeaveRoomDialog`. Empty members: Postie's sentence in the heading font. |
| `AddMenu` | The "+" of the sidebar: a `role="menu"` card on `--paper-raised` with three items (New chat, Join a hall, Add a contact), icon then label. |
| `JoinRoom` | A `Dialog` with two tabs (`aria-pressed`, navy underline like the sidebar tabs): the address form, or `RoomBrowser`. The password field appears only when the hall asks for it. |
| `RoomBrowser` | A domain field with "Look up" beside it, then a scrollable list (240px) of halls: name, JID in monospace, members count with the `users` icon. Nothing listed: `EmptyState` with Postie `searching` (80px). |
| `Sidebar` | 300px: the `AccountMenu` row (sign out, my devices and account deletion live in it); a kraft banner while reconnecting or offline ("Sign in again"), and for failed background actions; "Chats" / "Contacts" toggle buttons (`aria-pressed`); pill search that filters by title or name; "+" opens `AddMenu`. |

Postie's sentences (errors, empty states, the sealed letter) always use `--font-heading` with
`SOFT 100`; the rest of the interface uses `--font-text`.
