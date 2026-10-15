# Design system "Postal"

_Created 2026-10-15. Source: `packages/ui/src/theme/tokens.css`, `fonts.css`, `packages/ui/src/illustrations/Postie.tsx`._

## Tokens

Defined on `:root` in `tokens.css`. The dark values apply under `prefers-color-scheme: dark`
unless `data-theme="light"` is set on `<html>`, and always under `data-theme="dark"`. The theme is
therefore right on first paint, with no JavaScript (spec 4.2; Review Focus 5 of the milestone 0 plan).

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
tokens only, no hard-coded color (the one exception is the ink on the yellow badge, which must
stay dark in both themes)._ Motion goes only through `var(--motion)` / `var(--motion-fast)`.

| Component | Rule |
|---|---|
| `Button` | One component, four variants: `primary` (navy fill), `secondary` (navy outline), `ghost` (icon buttons, no border), `danger` (red outline, destructive actions). Pill shaped. |
| `Field` | Label always visible above the input; placeholders are hints, never labels. |
| `Dialog` | A raised card on a dimmed backdrop, `role="dialog"`, `aria-modal`, titled; focus goes to the first field (else the card), Tab cycles inside, Esc and the X close it and the focus returns to the opener. Small: one form, two buttons. Destructive actions (remove a contact) confirm through it. |
| `PresenceDot` | 10px dot: `--success` online, `--warning` away, `--red` dnd, `--ink-muted` offline. The name is in `title` and `aria-label`. |
| `ChatList` | Rows: title, one-line preview, time (today: hour; else: short date), unread **badge** on `--yellow` with dark ink. The selected row has a navy bar on the left. |
| `ContactList` | Grouped under presence headings, in the service's order. |
| `MessageList` | Grouped by day (sticky pill separator: "Today", "Yesterday", or the long date in the locale) then by consecutive sender. |
| `MessageBubble` | **Bubbles**: incoming on `--paper-raised`, bottom-left corner tighter; outgoing on `--navy` with `--navy-contrast` text, bottom-right corner tighter. Time at the bottom, visible on the last bubble of a run and on hover. **Stamps** (outgoing only), in `--navy-contrast` on the bubble: pending clock, sent one check, delivered double check. Read and failed sit on a small `--paper-raised` chip so they stand out on navy in both themes: read in `--ink`, failed in `--red`, with a "Retry" button. An `undecryptable` message shows Postie's sentence in the heading font with the **wax seal** (a `--red` stamp icon), never an empty bubble. |
| `Linkify` | Bodies are text; only `http(s)://` and `xmpp:` become links, `rel="noreferrer"`, routed through `onOpenLink`. |
| `Composer` | Auto-growing textarea (max 200px), Enter sends, Shift+Enter breaks the line, send button disabled while empty; errors from the service inline in red, in Postie's voice. |
| `Details` | Right pane, 280px: the peer's JID in monospace and the destructive action in `danger`. |
| `Sidebar` | 300px: account name with its presence dot (online, or offline when the line is down) and sign out; a kraft banner while reconnecting or offline ("Sign in again"), and for failed background actions; "Chats" / "Contacts" toggle buttons (`aria-pressed`); pill search that filters by title or name; "+" for a new chat or a new contact. |

Postie's sentences (errors, empty states, the sealed letter) always use `--font-heading` with
`SOFT 100`; the rest of the interface uses `--font-text`.
