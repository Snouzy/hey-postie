// Sets the app version everywhere it is written. Run with `pnpm version:set <x.y.z>`.
//
// The source of truth is apps/desktop/src-tauri/tauri.conf.json; Cargo.toml, Cargo.lock and the
// three workspace package.json files must carry the same number, so this script writes them all.

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const TAURI_CONF = join(ROOT, 'apps/desktop/src-tauri/tauri.conf.json');
const CARGO_TOML = join(ROOT, 'apps/desktop/src-tauri/Cargo.toml');
const CARGO_LOCK = join(ROOT, 'apps/desktop/src-tauri/Cargo.lock');
const PACKAGES = ['apps/desktop', 'packages/core', 'packages/ui'].map((dir) =>
  join(ROOT, dir, 'package.json'),
);

const version = process.argv[2];
if (!version || !/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(version)) {
  console.error('Usage: pnpm version:set <x.y.z>');
  process.exit(1);
}

/** Replaces the first match of `pattern`, whose group 1 is the text before the quoted version. */
function rewrite(path, pattern) {
  const text = readFileSync(path, 'utf8');
  if (!pattern.test(text)) throw new Error(`${path}: no version found to replace`);
  writeFileSync(path, text.replace(pattern, `$1"${version}"`));
  console.log(`${path.slice(ROOT.length + 1)} -> ${version}`);
}

const JSON_VERSION = /^(\s*"version":\s*)"[^"]*"/m;

rewrite(TAURI_CONF, JSON_VERSION);
for (const path of PACKAGES) rewrite(path, JSON_VERSION);
// Only the [package] section's version, which is the first one in the file.
rewrite(CARGO_TOML, /^(version = )"[^"]*"/m);
rewrite(CARGO_LOCK, /^(name = "hey-postie"\nversion = )"[^"]*"/m);
