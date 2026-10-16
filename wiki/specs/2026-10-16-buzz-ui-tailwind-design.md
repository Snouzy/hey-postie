# Buzz as the UI reference, and the move to Tailwind: design

_Written on 2026-10-16. Decisions of the author on 2026-10-16, recorded in
[product/decisions.md](../product/decisions.md#interface). Source of the analysis:
[block/buzz](https://github.com/block/buzz) `desktop/` (Apache-2.0), read at its `main` of
2026-10-16; paths below are relative to that folder._

## 1. Goal

The desktop app of Buzz (Tauri 2, React 19, Tailwind 4, shadcn, Radix) is the first reference for
Hey Postie's interface: layout, interactions, keyboard, polish. Buzz is **not** a code base: it
speaks Nostr, it is the client of its own relay, it has no OMEMO, and it is far too large for us.
We take its look and its behavior; we copy code only for small, protocol-free pieces.

The brand stays ours: the Postal palette, Fraunces and Figtree, Postie, the radii, the voice.

## 2. Decisions

| # | Decision | Why |
|---|---|---|
| 1 | Styling moves from CSS Modules to **Tailwind 4 + shadcn conventions** (`cn`, `cva`), in **one migration**, during a UI freeze. | Buzz's components port with little rewriting; one styling system at a time (KISS), so no gradual migration. |
| 2 | The migration is **visual parity**: no screen changes during it. Buzz-inspired changes come after, one pull request each. | A parity change can be checked screen by screen; mixing it with redesign makes regressions invisible. |
| 3 | `tokens.css` stays the **one source** of colors, spacing, radii, layers and motion. Tailwind reads it through `@theme`. | The tokens already switch light and dark with no JavaScript; Tailwind must not fork them. |
| 4 | Messages: **two layouts, a setting**. Bubbles (today's `MessageBubble`) and lines (Buzz / Slack style rows). Default: bubbles in direct chats, lines in halls. | Bubbles read best one to one; lines scale better in busy halls. |
| 5 | Notifications: the text of a **sealed** (OMEMO) letter is **hidden by default**, with its own switch. | A sealed letter's text should not land in the OS notification store unless the user says so (Signal does the same). |

## 3. Migration to Tailwind

### 3.1 Before: the freeze

1. The author picks the UI branches that must land before the migration (today: `feat/b1-ui-*`,
   `feat/b4-ui-presence`, `feat/b5-empty-states`, `fix/ui-scroll-shift`, `fix/row-fill`,
   `feat/resizable-panes`, `feat/m5-ui-settings` and the other branches touching `packages/ui`).
   They are merged into the integration branch.
2. From then until the migration is merged, **no other session touches `packages/ui` styles**.
   Core, Rust and wiki work continue.

### 3.2 The foundation (first pull request)

- Dependencies, added by this session only (one session at a time, AGENTS.md section 7), versions
  checked at install and recorded in [dependencies.md](../development/dependencies.md) and
  [LICENSING.md](../../LICENSING.md):

  | Package | License | Why |
  |---|---|---|
  | `tailwindcss`, `@tailwindcss/vite` | MIT | Utility classes, built by Vite |
  | `clsx`, `tailwind-merge` | MIT | `cn()`: join classes, last one wins |
  | `class-variance-authority` | Apache-2.0 | Component variants (`Button`: primary, secondary, ghost, danger) |

- `packages/ui/src/theme/tailwind.css`: `@import 'tailwindcss'`, then `@theme` mapping every Postal
  token (`--color-paper: var(--paper)`, `--color-ink: var(--ink)`, …, the spacing, the radii, the
  `--z-*` layers, the fonts). Utilities then read `bg-paper`, `text-ink-muted`, `rounded-bubble`,
  `z-dialog`.
- **No `dark:` variant.** The tokens already change value under `prefers-color-scheme` and
  `data-theme`; a utility that reads a token follows the theme by itself. A component that needs a
  different shape in dark mode (rare) uses a variant bound to our selector, never Tailwind's
  default `.dark` class. The no-flash startup (`apps/desktop/public/theme.js`) is unchanged.
- shadcn names (`--background`, `--primary`, …) are **not** added: our components use our token
  names. A component copied from Buzz is renamed on the way in (`bg-background` → `bg-paper`,
  `bg-card`/`bg-popover` → `bg-paper-raised`, `text-foreground` → `text-ink`,
  `text-muted-foreground` → `text-ink-muted`, `bg-primary` → `bg-navy`,
  `text-destructive` → `text-red`, `border-border` → `border-line`).
- `packages/ui/src/lib/cn.ts`, and `Button` rewritten with `cva` as the reference component.
- `theme/layers.test.ts` checks the `z-*` classes instead of `z-index` in CSS: no bare `z-[n]`.
- [patterns.md](../development/patterns.md) gains two entries: utility classes with tokens, and
  variants with `cva`.

### 3.3 The conversion (second pull request)

- Every `*.module.css` of `packages/ui` becomes classes in its component; the file is deleted, then
  `css-modules.d.ts`. What utilities cannot say cleanly (keyframes, the kraft shimmer, the paper
  texture, scrollbar hiding) goes in `theme/tailwind.css` under `@utility` or `@layer components`,
  named after what it is.
- Tests are not rewritten: they query by role and text, not by class. They must pass unchanged.
- **Proof of parity:** screenshots of every screen, light and dark, before and after, compared
  side by side; differences are fixed or listed in the pull request with a reason. There is no
  screenshot harness in the repo yet: the foundation pull request adds one (Playwright against the
  UI running on fakes, a dev dependency recorded like the others) and takes the "before" set.
- [design-system.md](../development/design-system.md) and [ui.md](../development/ui.md) are
  updated in the same commit (sources become the components and `tailwind.css`).

## 4. What we take from Buzz, after the migration

Each line is its own pull request with its own short spec section; order to be set by the author.

### 4.1 Interface

| Item | From Buzz | For us |
|---|---|---|
| Message lines layout | `features/messages/ui/MessageRow.tsx` (layout only; the file is Nostr-bound and is rewritten) | Decision 4. Setting under Appearance: "Automatic" (default), "Bubbles", "Lines". Grouping, day dividers, reactions and stamps work in both. |
| Density and text size | `shared/styles/globals/typography.css`: a type unit, ⌘+/− zoom, text size 13/14/15, density compact / comfortable / spacious | Appearance settings; tokens for message text and gaps. |
| Quick switcher | `features/search/ui/TopbarSearch.tsx`, ⌘K | ⌘K over chats, halls and contacts, through existing services. |
| Shortcuts | `shared/lib/keyboard-shortcuts.ts`: ⇧⌘K new chat, ⌘[ / ⌘] back and forward, Esc mark read, ⌘, settings, a shortcuts list in settings | Added to [ui.md](../development/ui.md#keyboard). |
| Sidebar sections | `features/sidebar/ui/SidebarSection.tsx`: collapsible, unread dot or count, star, mute, context menu, "more unread" pill | Starred = bookmarks (XEP-0402); roster groups as sections. |
| Timeline helpers | `features/messages/lib/timelineItems.ts` (join/leave rows collapsed within an hour), `useBufferedTimelineMessages.ts` ("jump to latest" without moving the reader), `useLoadOlderOnScroll.ts` | MUC presence noise; history paging. |
| Primitives | `shared/ui/*` (Radix-based dialog, popover, menus, tooltip, tabs, switch) | Replace our own `Dialog` and `Popover` only if every behavior listed in design-system.md is kept and its tests pass. |

Buzz has no equivalent for the roster, subscription requests, dnd / xa presence, or OMEMO trust:
those stay our own designs.

### 4.2 Desktop shell

| Item | From Buzz (`src-tauri/src/`) | Note |
|---|---|---|
| Tray action queue | `tray_menu.rs`: clicks queued in Rust, drained by the webview once mounted | A click before React mounts is not lost. |
| Notification click | `macos_notifications.rs` (own delegate on macOS), `commands/notifications.rs` (Linux through `notify-rust`) | The target holds `{ chatId }` only, never text (Buzz stores the text: not copied). |
| `xmpp:` links | `deep_link.rs`: single instance with the deep-link feature, pending-link queue | Our own RFC 5122 parser. Never log the URL (it holds JIDs). |
| macOS menu | `app_menu.rs` | ⌘C / ⌘V in the webview. |
| Window state | `tauri-plugin-window-state`, window shown after restore | No flash or jump on launch. |

Not copied: `macOSPrivateApi` (rules out the Mac App Store), the file fallback for secrets, drafts
in `localStorage`, the theme engine, agents, workflows, huddles, canvas, forge, link previews
fetched by the receiver.

### 4.3 Copying code

Apache-2.0 code may enter this AGPL-3.0 project. A copied file keeps Buzz's copyright line and the
mention "Adapted from block/buzz, Apache-2.0", and `LICENSING.md` lists Buzz among third-party
components. Copy only what has no Nostr in it; otherwise rewrite after reading.

## 5. Sealed letters in notifications (decision 5)

- Core: `NotificationsService` gains `setShowSealedPreview(value)` / `getShowSealedPreview()`,
  **off by default**. A message with `encryption === 'omemo'` shows `HIDDEN_PREVIEW` unless both the
  general preview and the sealed preview are on. Plain letters keep today's rule.
- This changes a contract (`contracts/services.ts`): its own small pull request first.
- UI: a second checkbox under Settings › Notifications, "Show sealed letters in notifications",
  disabled while the general preview is off, with a sentence on what it means (the text is
  stored by the system, outside the seal).
- Tests: a sealed letter is hidden by default; shown only with both switches on; an
  `undecryptable` letter is unchanged (🔏).

## 6. Done when

- No `.module.css` left in `packages/ui`; `pnpm verify` passes; the parity screenshots are attached
  to the migration pull request.
- dependencies.md, LICENSING.md, patterns.md, design-system.md and ui.md describe the new state.

## Points to check

- Exact versions and licenses of the Tailwind packages at install time.
- Whether Tailwind 4's Vite plugin and Vitest with jsdom need a setup change for CSS imports.
- The default of decision 4 ("Automatic") was proposed by the agent; the author confirms it.
