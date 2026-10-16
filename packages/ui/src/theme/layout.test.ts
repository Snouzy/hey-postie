import { describe, expect, it } from 'vitest';
import { COLUMNS } from '../components/EmojiPicker';

/** Vite's `import.meta.glob`, which vitest provides; the package has no `vite/client` types. */
type GlobMeta = {
  glob(pattern: string, options: { query: string; eager: true; import: 'default' }): unknown;
};

const stylesheets = (import.meta as unknown as GlobMeta).glob('../**/*.css', {
  query: '?raw',
  eager: true,
  import: 'default',
}) as Record<string, string>;

function stylesheet(name: string): string {
  return Object.entries(stylesheets).find(([path]) => path.endsWith(`/${name}`))?.[1] ?? '';
}

/** The declarations of one rule, by its selector. */
function rule(css: string, selector: string): string {
  return css.match(new RegExp(`${selector.replace('.', '\\.')}\\s*\\{([^}]*)\\}`))?.[1] ?? '';
}

/**
 * jsdom lays nothing out, so what the stylesheets promise is read from their text (as
 * `layers.test.ts` does for the z-index scale): the main screen never scrolls up or down, the
 * columns let their lists scroll, and the emoji grid stays inside its card.
 */
describe('what scrolls', () => {
  it('lets the main screen scroll sideways only', () => {
    const main = rule(stylesheet('Main.module.css'), '.main');
    expect(main).toMatch(/overflow-x:\s*auto;/);
    expect(main).toMatch(/overflow-y:\s*hidden;/);
    expect(main).not.toMatch(/overflow:\s/);
  });

  it('keeps the center column at the window height so its list scrolls', () => {
    // A `flex: 1` column item shrinks below its content only with `min-height: 0`.
    expect(rule(stylesheet('Conversation.module.css'), '.conversation')).toMatch(
      /min-height:\s*0;/,
    );
    expect(rule(stylesheet('MessageRequest.module.css'), '.request')).toMatch(/min-height:\s*0;/);
    expect(rule(stylesheet('MessageList.module.css'), '.scroller')).toMatch(/min-height:\s*0;/);
  });

  it('never scrolls the window itself from the root', () => {
    for (const [file, css] of Object.entries(stylesheets)) {
      for (const [, selector = ''] of css.matchAll(/(?:^|\n)((?:html|body|#root)[^{]*)\{/g)) {
        expect(rule(css, selector.trim().split(',')[0] ?? ''), `${file}: ${selector}`).not.toMatch(
          /overflow/,
        );
      }
    }
  });

  it('fits the emoji grid in its card: as many columns as the arrows move by, none wider', () => {
    const picker = stylesheet('EmojiPicker.module.css');
    expect(rule(picker, '.grid')).toContain(`repeat(${COLUMNS}, minmax(0, 1fr))`);
    expect(rule(picker, '.grid')).toMatch(/overflow-x:\s*hidden;/);
    expect(rule(picker, '.cell')).toMatch(/min-width:\s*0;/);
    expect(rule(picker, '.picker')).toMatch(/width:\s*320px;/);
  });
});
