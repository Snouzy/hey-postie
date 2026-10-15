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
