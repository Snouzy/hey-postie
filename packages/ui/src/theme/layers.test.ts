import { describe, expect, it } from 'vitest';

/** Vite's `import.meta.glob`, which vitest provides; the package has no `vite/client` types. */
type GlobMeta = {
  glob(pattern: string, options: { query: string; eager: true; import: 'default' }): unknown;
};

/** Every stylesheet of the package, by path relative to this file, as text. */
const stylesheets = (import.meta as unknown as GlobMeta).glob('../**/*.css', {
  query: '?raw',
  eager: true,
  import: 'default',
}) as Record<string, string>;

/** One stylesheet by its file name (Vite keys the ones next to this file as `./name`). */
function stylesheet(name: string): string {
  return Object.entries(stylesheets).find(([path]) => path.endsWith(`/${name}`))?.[1] ?? '';
}

const tokens = stylesheet('tokens.css');
const dialog = stylesheet('Dialog.module.css');
const list = stylesheet('MessageList.module.css');

/**
 * jsdom lays nothing out, so the stacking itself cannot be seen here. What can: that every
 * component stacks through the `--z-*` scale of the tokens, and that the dialog is its top.
 */
describe('layers', () => {
  const scale = new Map(
    [...tokens.matchAll(/(--z-[a-z]+):\s*(\d+);/g)].map(([, name, value]) => [name, Number(value)]),
  );

  it('defines the scale once, lowest first, with the dialog on top', () => {
    expect([...scale.keys()]).toEqual(['--z-sticky', '--z-float', '--z-popover', '--z-dialog']);
    expect([...scale.values()]).toEqual([...scale.values()].sort((a, b) => a - b));
    expect(Math.max(...scale.values())).toBe(scale.get('--z-dialog'));
  });

  it('is the only way a component sets a z-index', () => {
    expect(Object.keys(stylesheets).length).toBeGreaterThan(10);
    for (const [file, css] of Object.entries(stylesheets)) {
      if (file.endsWith('tokens.css')) continue;
      for (const [, value = ''] of css.matchAll(/z-index:\s*([^;]+);/g)) {
        expect(value, file).toMatch(/^var\(--z-[a-z]+\)$/);
        expect(scale.has(value.slice(4, -1)), `${file}: ${value}`).toBe(true);
      }
    }
  });

  it('puts the dialog backdrop above the sticky day chip', () => {
    expect(dialog).toMatch(/\.backdrop\s*\{[^}]*z-index:\s*var\(--z-dialog\)/);
    expect(list).toMatch(/\.separator\s*\{[^}]*z-index:\s*var\(--z-sticky\)/);
  });
});
