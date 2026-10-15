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
| `--red` | `#C8321B` | `#F07A66` | Mailbox red: wax seal, destructive actions, errors |
| `--kraft` | `#B98A4E` | `#D9B27C` | Satchel, attachment cards |
| `--yellow` | `#F2C14E` | same | Stamp yellow: highlights, badges |
| `--on-yellow` | `#1E2230` | same | Ink on the stamp: stays dark because the yellow does |
| `--success`, `--warning` | `#2E7D4F`, `#A35900` | same | Statuses |

Spacing: `--space-1` (4px) to `--space-12` (48px). Radii: `--radius-sm` 8, `--radius` 12,
`--radius-bubble` 16. Fonts: `--font-heading` Fraunces, `--font-text` Figtree, `--font-mono`.
Reduced motion disables every animation and transition.

## Fonts

Fraunces (variable, OFL) for headings and Postie's sentences, with `SOFT 100` for the rounder
cut; Figtree (variable, OFL) for text. Bundled in `packages/ui/src/theme/fonts/` with their
licenses, never loaded from the network.

## Postie

`<Postie mood label size />`. Five moods: `happy` (welcome), `delivering` (sending, loading),
`sealed` (encryption, wax seal in hand), `oops` (errors, never mocking), `asleep` (empty states,
offline). `label` comes from the dictionary keys `postie.alt.<mood>`. Version 1 ships line-art
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
| `Button` | One component, four variants: `primary` (navy fill), `secondary` (navy outline), `ghost` (icon buttons, no border), `danger` (red outline, destructive actions). Pill shaped. |
| `Field` | Label always visible above the input; placeholders are hints, never labels. A helper sentence goes in a `<p>` the input points to with `aria-describedby` (see `CreateAccount`). |
| `Dialog` | A raised card on a dimmed backdrop, `role="dialog"`, `aria-modal`, titled; focus goes to the first field (else the card), Tab cycles inside, Esc and the X close it and the focus returns to the opener. `closable={false}` while an action is in flight: Esc and the X are ignored (the X is disabled). Small: one form, two buttons. Destructive actions (remove a contact) confirm through it. |
| `PresenceDot` | 10px dot: `--success` online, `--warning` away, `--red` dnd, `--ink-muted` offline. The name is in `title` and `aria-label`. |
| `ChatList` | Rows: title, one-line preview, time (today: hour; else: short date), unread **badge** on `--yellow` with dark ink. A hall shows the `users` icon before its title (with a hidden "Hall" for screen readers); its badge is the mentions count on yellow, or the plain unread count in a muted chip (`--line`, `--ink-muted`). The selected row has a navy bar on the left. |
| `ContactList` | Grouped under presence headings, in the service's order. |
| `MessageList` | Grouped by day (sticky pill separator: "Today", "Yesterday", or the long date in the locale) then by consecutive sender. In a hall, the sender's nick sits above each run of incoming messages, small and muted. |
| `Attachments`, `InlineImage`, `ParcelCard` | The parcels of a message, under the body. A picture under the inline limit is shown as an `<img>` from an object URL (max 320px tall, `--radius-sm`, `cursor: zoom-in`), with a kraft **skeleton** (shimmer, still under reduced motion) while it loads and `RetryNotice` when it fails; an `aesgcm` parcel wears a 12px lock on `--kraft` at its corner. Any other file is a **parcel card**: `--kraft-soft` background with a faint `--kraft` border, the type's lucide icon in `--kraft` (image, music, film, file-text, file-archive, file), the name in 600 and the size in `--ink-muted` 12px, and a small "Save" pill; a picture from someone outside the address book adds a `primary` "Load image" pill before it. |
| `PendingParcel` | A parcel on its way: an outgoing (navy) bubble holding a kraft card with a `package` icon, the name, the size and a 4px **progress bar** (`--kraft` track, `--navy` fill, `role="progressbar"`). On failure Postie's sentence in the heading font with "Retry" (`danger`, on `--paper-raised`) and a "Dismiss" X. |
| `Lightbox` | A `Dialog` titled with the file name: the picture up to 70vh, "Save" as `primary`. |
| `DropOverlay` | Over the conversation while files hover it: `--paper` at 88% with a 3px dashed `--kraft` border, Postie `delivering` (120px) and "Drop your parcel here" in the heading font. `pointer-events: none` so the drop reaches the column. |
| `Popover` | A floating card for pickers and quick rows: `--paper-raised`, `--line` border, `--radius`, `--shadow-card`, `position: fixed` next to its opener (re-placed on scroll and resize), `role="dialog"`. |
| `EmojiPicker` | 320px wide: a pill search field, category toggle buttons with the navy underline of the sidebar tabs, then an 8-column grid of 22px emojis (240px tall, scrolls) on `--paper` when hovered or focused. Empty: Postie's sentence in the heading font. |
| `ReactionBar` | The "React" ghost button of a bubble's hover toolbar (on `--paper-raised`, `--line` border, `--shadow-card`, so it reads on both bubbles); its popover is a row of six 32px emojis and a `smile-plus` "More emojis". |
| `Reactions` | **Pills** under the bubble: `--paper-raised` with a `--line` border, 999px radius, the emoji then the count in 600 12px; mine (`aria-pressed`) has a `--navy` border on a 30% `--yellow` mix. Hover: navy border. |
| `MessageBubble` | **Bubbles**: incoming on `--paper-raised`, bottom-left corner tighter; outgoing on `--navy` with `--navy-contrast` text, bottom-right corner tighter. Time at the bottom, visible on the last bubble of a run and on hover. **Stamps** (outgoing only), in `--navy-contrast` on the bubble: pending clock, sent one check, delivered double check. Read and failed sit on a small `--paper-raised` chip so they stand out on navy in both themes: read in `--ink`, failed in `--red`, with a "Retry" button. An `undecryptable` message shows Postie's sentence in the heading font with the **wax seal** (a `--red` stamp icon), never an empty bubble, then a plain muted help line with a small "Check their devices" button. An outgoing `omemo` message wears the **wax badge**: a 10px `--red` dot with a 2px `--paper` ring at the top-right corner of the bubble, hidden "Sealed" text for screen readers. A **mention** (`isMention`, incoming) sits on a soft mix of `--yellow` and `--paper-raised` with a 3px `--yellow` left border and a visually hidden "Mentions you". |
| `Linkify` | Bodies are text; only `http(s)://` and `xmpp:` become links, `rel="noreferrer"`, routed through `onOpenLink`. |
| `Composer` | Paperclip (attach) and smile (emoji picker) as 40px `ghost` buttons on the left, then the auto-growing textarea (max 200px), Enter sends, Shift+Enter breaks the line, Tab completes a member's nick in a hall, an image paste leaves as a parcel, send button disabled while empty, the whole thing disabled outside a hall (a kraft banner above it says so, with "Join again" when the hall is known); the hint reads "Write a sealed letter…" while the chat is sealed; errors from the service inline in red, in Postie's voice. |
| `SealToggle` | The lock in the conversation header: a `ghost` button with `aria-pressed`, lucide `lock-open` in ink when open, `lock` in `--red` (wax) when the chat is sealed; disabled with `aria-busy` while the service answers. The no-key sentence shows under the header in Postie's voice. |
| `DeviceList` | A `<ul>` of devices: the fingerprint in `--font-mono` 12px, groups of eight; the **trust stamp**, a small uppercase 11px label with a 1px border in its own color: `--ink-muted` untrusted, `--navy` trusted, `--success` verified, `--red` blocked; then the actions as small pills (Verify `secondary`, Block / Unblock / Remove `danger`), each `aria-describedby` the row's fingerprint. Rows are focusable: the focus lands on the row once an action is done. |
| `EncryptionSection`, `RoomEncryption` | The "Encryption" part of a details pane: the same uppercase heading as the members, a muted hint to compare in person, then the `DeviceList` (in a hall: one list per member, under the nick). Empty: Postie's sentence in the heading font. The section is focusable (`tabindex=-1`) so a sealed letter can send the reader to it. |
| `MyDevices` | A `Dialog`: a muted hint, then my own devices in a `DeviceList` with "Remove"; the device in use wears a `--success` "This device" stamp instead of the button. The confirmation (sentence, fingerprint, Cancel / Remove in `danger`) replaces the list inside the same card. |
| `DetailsPane` | Picks `Details` for a direct chat or `RoomDetails` for a hall with a record, keyed by the chat; nothing otherwise. |
| `RetryNotice` | A failed load: Postie's sentence in the heading font and `--red`, with a small "Retry" pill beside it. Never confused with an empty state. |
| `Details` | Right pane, 280px: the peer's JID in monospace, the Encryption section, and the destructive action in `danger`. |
| `AccountMenu` | The account row of the sidebar: presence dot, display name, chevron; a button with `aria-haspopup="menu"`. Opens a raised card with the JID in monospace above a `role="menu"` of four `menuitem`s, "Sign out", "My devices…" (lucide `key-round`), "Settings…" (lucide `settings`) and "Delete my account…" in `--red`. Focus on the first item, arrows wrap, Esc, Tab out and a click outside close it and the focus returns to the row. |
| `Settings` | A `Dialog` of four sections under the same uppercase muted heading as `RoomDetails`: Appearance and Language as `fieldset` radios with `accent-color: var(--navy)`, Notifications as a plain checkbox with a muted hint under it, About with the version in `--font-mono` muted, the "Source code" link in `--navy` and a `secondary` "Licenses" pill. No "Save": every change applies at once. |
| `Licenses` | A `Dialog`: a muted intro sentence, a `Field` search, then a 320px scrollable list of groups (license as the uppercase heading, names as `--navy` links or plain text, versions in `--font-mono` muted). Nothing found: Postie's sentence in the heading font. |
| `DeleteAccountDialog` | A `Dialog` for the one irreversible action: a plain sentence (no joke), a field where the user types their own JID, a `danger` button disabled until it matches, Postie's sentence below while deleting or on failure. |
| `RoomDetails` | The right pane of a hall: topic, JID, members under role headings (same uppercase heading as `ContactList`) with the affiliation in `--kraft`, the Encryption section (members' devices, grouped by nick), the notify rule as radios with `accent-color: var(--navy)`, "Leave the hall" in `danger` confirmed through `Dialog`. Empty members: Postie's sentence in the heading font. |
| `AddMenu` | The "+" of the sidebar: a `role="menu"` card on `--paper-raised` with three items (New chat, Join a room, Add contact), icon then label. |
| `JoinRoom` | A `Dialog` with two tabs (`aria-pressed`, navy underline like the sidebar tabs): the address form, or `RoomBrowser`. The password field appears only when the hall asks for it. |
| `RoomBrowser` | A domain field with "Look up" beside it, then a scrollable list (240px) of halls: name, JID in monospace, members count with the `users` icon. |
| `Sidebar` | 300px: the `AccountMenu` row (sign out, my devices and account deletion live in it); a kraft banner while reconnecting or offline ("Sign in again"), and for failed background actions; "Chats" / "Contacts" toggle buttons (`aria-pressed`); pill search that filters by title or name; "+" opens `AddMenu`. |

Postie's sentences (errors, empty states, the sealed letter) always use `--font-heading` with
`SOFT 100`; the rest of the interface uses `--font-text`.
