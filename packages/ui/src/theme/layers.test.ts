import { describe, expect, it } from 'vitest';
import { components, source, stylesheets } from './sources';

const tokens = source(stylesheets, 'tokens.css');
const tailwind = source(stylesheets, 'tailwind.css');

/**
 * jsdom lays nothing out, so the stacking itself cannot be seen here. What can: that every
 * component stacks through the `--z-*` scale of the tokens (the `z-*` utilities of tailwind.css),
 * and that the dialog is its top.
 */
describe('layers', () => {
  const scale = new Map(
    [...tokens.matchAll(/(--z-[a-z]+):\s*(\d+);/g)].map(([, name, value]) => [
      name ?? '',
      Number(value),
    ]),
  );

  it('defines the scale once, lowest first, with the dialog on top', () => {
    expect([...scale.keys()]).toEqual(['--z-sticky', '--z-float', '--z-popover', '--z-dialog']);
    expect([...scale.values()]).toEqual([...scale.values()].sort((a, b) => a - b));
    expect(Math.max(...scale.values())).toBe(scale.get('--z-dialog'));
  });

  it('gives each layer of the scale its utility', () => {
    for (const name of scale.keys()) {
      expect(tailwind).toMatch(
        new RegExp(`@utility ${name.slice(2)} \\{\\s*z-index: var\\(${name}\\);`),
      );
    }
  });

  it('is the only way a component sets a z-index', () => {
    expect(Object.keys(components).length).toBeGreaterThan(10);
    for (const [file, code] of Object.entries(components)) {
      for (const [utility = ''] of code.matchAll(/(?<![\w-])-?z-[\w[\]()-]+/g)) {
        expect(scale.has(`--${utility}`), `${file}: ${utility}`).toBe(true);
      }
    }
    for (const [file, css] of Object.entries(stylesheets)) {
      if (file.endsWith('tokens.css') || file.endsWith('tailwind.css')) continue;
      expect(css, file).not.toMatch(/z-index:/);
    }
  });

  it('puts the dialog backdrop above the sticky day chip', () => {
    expect(source(components, 'Dialog.tsx')).toMatch(/z-dialog/);
    expect(source(components, 'MessageList.tsx')).toMatch(
      /sticky[^'"]*z-sticky|z-sticky[^'"]*sticky/,
    );
  });
});
