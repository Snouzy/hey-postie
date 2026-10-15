// Trims Converse's emoji.json (apps/desktop/public/emoji.json) into the list the picker uses.
// Run from the repo root: `node packages/ui/scripts/trim-emoji.mjs`, then commit the output.
// Kept: `{ category, emoji, shortname, keywords }`. Dropped: Converse's custom images, the bare
// skin-tone modifiers, and the skin-tone variants (`:ok_hand_tone1:`), which would multiply the
// "people" grid by six.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const source = resolve(here, '../../../apps/desktop/public/emoji.json');
const target = resolve(here, '../src/data/emoji.json');

const SKIPPED_CATEGORIES = new Set(['custom', 'modifiers']);
const TONE = /_tone\d:$/;

const raw = JSON.parse(readFileSync(source, 'utf8'));
const emojis = [];
for (const [category, entries] of Object.entries(raw)) {
  if (SKIPPED_CATEGORIES.has(category)) continue;
  for (const entry of Object.values(entries)) {
    if (!entry.cp || TONE.test(entry.sn)) continue;
    const emoji = String.fromCodePoint(
      ...entry.cp.split('-').map((hex) => Number.parseInt(hex, 16)),
    );
    emojis.push({
      category,
      emoji,
      shortname: entry.sn.slice(1, -1),
      keywords: (entry.sns ?? []).map((sn) => sn.slice(1, -1)),
    });
  }
}

writeFileSync(target, JSON.stringify(emojis));
// The repo's formatter has the last word on the file's shape.
execFileSync('pnpm', ['exec', 'biome', 'format', '--write', target], { stdio: 'inherit' });
console.log(`${emojis.length} emojis written to ${target}`);
