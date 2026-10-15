// Generates packages/ui/src/data/licenses.json: every shipped dependency with its license, for
// the "Licenses" dialog. Run with `pnpm licenses` after adding or upgrading a dependency.
//
// Sources: `pnpm -r licenses list --prod --json` (npm, runtime dependencies of every workspace
// package), `cargo metadata` (Rust, normal dependencies of the desktop crate for the three
// desktop targets), and the two fonts, which are not packages and are listed by hand.

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const OUTPUT = join(ROOT, 'packages/ui/src/data/licenses.json');
const CARGO_MANIFEST = join(ROOT, 'apps/desktop/src-tauri/Cargo.toml');
const TARGETS = ['aarch64-apple-darwin', 'x86_64-pc-windows-msvc', 'x86_64-unknown-linux-gnu'];

const FONTS = [
  {
    source: 'font',
    name: 'Fraunces',
    version: 'variable',
    license: 'OFL-1.1',
    repository: 'https://github.com/undercasetype/Fraunces',
  },
  {
    source: 'font',
    name: 'Figtree',
    version: 'variable',
    license: 'OFL-1.1',
    repository: 'https://github.com/erikdkennedy/figtree',
  },
];

// Packages whose package.json has no `license` field; read from their LICENSE file on 2026-10-15.
const LICENSE_FROM_FILE = {
  '@converse/localforage-getitems': 'Apache-2.0',
  'localforage-setitems': 'Apache-2.0',
};

function run(command, args) {
  return execFileSync(command, args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
}

/** `git+https://github.com/x/y.git` or `github:x/y` → `https://github.com/x/y`. */
function cleanRepository(url) {
  if (typeof url !== 'string') return null;
  return url
    .replace(/^github:/, 'https://github.com/')
    .replace(/^git\+/, '')
    .replace(/^git:\/\//, 'https://')
    .replace(/^ssh:\/\/git@/, 'https://')
    .replace(/\.git$/, '');
}

function npmEntries() {
  const byLicense = JSON.parse(run('pnpm', ['-r', 'licenses', 'list', '--prod', '--json']));
  const entries = [];
  for (const pkg of Object.values(byLicense).flat()) {
    const manifest = JSON.parse(readFileSync(join(pkg.paths[0], 'package.json'), 'utf8'));
    const repository =
      cleanRepository(manifest.repository?.url ?? manifest.repository) ?? pkg.homepage ?? null;
    const license =
      pkg.license === 'Unknown' ? (LICENSE_FROM_FILE[pkg.name] ?? 'Unknown') : pkg.license;
    for (const version of pkg.versions) {
      entries.push({ source: 'npm', name: pkg.name, version, license, repository });
    }
  }
  return entries;
}

function cargoEntries() {
  const metadata = JSON.parse(
    run('cargo', [
      'metadata',
      '--format-version',
      '1',
      '--manifest-path',
      CARGO_MANIFEST,
      ...TARGETS.flatMap((target) => ['--filter-platform', target]),
    ]),
  );
  const nodes = new Map(metadata.resolve.nodes.map((node) => [node.id, node]));
  // Walk the normal (not dev, not build) dependencies from the app crate.
  const reached = new Set();
  const queue = [metadata.resolve.root];
  while (queue.length > 0) {
    const id = queue.shift();
    if (reached.has(id)) continue;
    reached.add(id);
    for (const dep of nodes.get(id).deps) {
      if (dep.dep_kinds.some((kind) => kind.kind === null)) queue.push(dep.pkg);
    }
  }
  reached.delete(metadata.resolve.root);
  return metadata.packages
    .filter((pkg) => reached.has(pkg.id))
    .map((pkg) => ({
      source: 'cargo',
      name: pkg.name,
      version: pkg.version,
      license: pkg.license ?? 'Unknown',
      repository: pkg.repository ?? null,
    }));
}

function byName(a, b) {
  return a.name.localeCompare(b.name) || a.version.localeCompare(b.version);
}

const entries = [
  ...npmEntries().sort(byName),
  ...cargoEntries().sort(byName),
  ...FONTS.sort(byName),
];
writeFileSync(OUTPUT, `${JSON.stringify(entries, null, 2)}\n`);
run('pnpm', ['exec', 'biome', 'format', '--write', OUTPUT]);
console.log(`${entries.length} entries written to ${OUTPUT}`);
