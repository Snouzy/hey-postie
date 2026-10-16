import { describe, expect, it } from 'vitest';
import { COLUMNS } from '../components/EmojiPicker';
import { components, source, stylesheets } from './sources';

/** True when one line of the component (a class string) holds every given utility. */
function hasClasses(component: string, ...utilities: string[]): boolean {
  return source(components, component)
    .split('\n')
    .some((line) => {
      const words = line.split(/[\s'"`]+/);
      return utilities.every((utility) => words.includes(utility));
    });
}

/**
 * jsdom lays nothing out, so what the classes promise is read from the components' text (as
 * `layers.test.ts` does for the z-index scale): the main screen never scrolls up or down, the
 * columns let their lists scroll, and the emoji grid stays inside its card.
 */
describe('what scrolls', () => {
  it('lets the main screen scroll sideways only', () => {
    expect(hasClasses('Main.tsx', 'overflow-x-auto', 'overflow-y-hidden')).toBe(true);
    expect(source(components, 'Main.tsx')).not.toMatch(/\boverflow-(auto|hidden|scroll)\b/);
  });

  it('keeps the center column at the window height so its list scrolls', () => {
    // A `flex-1` column item shrinks below its content only with `min-h-0`.
    expect(hasClasses('Conversation.tsx', 'flex-1', 'min-h-0')).toBe(true);
    expect(hasClasses('MessageRequest.tsx', 'flex-1', 'min-h-0')).toBe(true);
    expect(hasClasses('MessageList.tsx', 'min-h-0', 'overflow-y-auto')).toBe(true);
  });

  it('sizes the side columns from the resizer variables, within their bounds', () => {
    expect(hasClasses('Sidebar.tsx', 'w-[clamp(220px,var(--sidebar-width,300px),480px)]')).toBe(
      true,
    );
    for (const name of ['Details.tsx', 'RoomDetails.tsx', 'DetailsPane.tsx']) {
      expect(hasClasses(name, 'w-[clamp(240px,var(--details-width,280px),480px)]'), name).toBe(
        true,
      );
    }
    // The folded sidebar is `hidden`: its `flex` must not win over it.
    expect(hasClasses('Sidebar.tsx', 'flex', '[&[hidden]]:hidden')).toBe(true);
    expect(hasClasses('PaneResizer.tsx', 'cursor-col-resize')).toBe(true);
  });

  it('never scrolls the window itself from the root', () => {
    for (const [file, css] of Object.entries(stylesheets)) {
      for (const [, selector = '', body = ''] of css.matchAll(
        /(?:^|\n)\s*((?:html|body|#root)[^{]*)\{([^}]*)\}/g,
      )) {
        expect(body, `${file}: ${selector}`).not.toMatch(/overflow/);
      }
    }
  });

  it('never lets the message list scroll sideways: the toolbar grows into the column', () => {
    // Laid out even while invisible: anchored on the outer side, it pokes past the list's edge.
    const bubble = source(components, 'MessageBubble.tsx');
    expect(bubble).toMatch(/incoming \? 'left-2' : 'right-2'/);
    // The 34px pill rests on the bubble's top edge and dips only into its 8px padding, never on
    // the text (seen covering it by the author on 2026-10-16).
    expect(hasClasses('MessageBubble.tsx', 'top-[-28px]')).toBe(true);
    expect(hasClasses('MessageToolbar.tsx', 'p-[2px]', 'border')).toBe(true);
    expect(hasClasses('MessageToolbar.tsx', 'absolute', 'whitespace-nowrap')).toBe(true);
    // A bubble keeps to its share of the column, and its pictures to the bubble.
    expect(hasClasses('MessageBubble.tsx', 'max-w-[min(70%,560px)]')).toBe(true);
    expect(hasClasses('Attachments.tsx', 'flex', 'min-w-0')).toBe(true);
    expect(hasClasses('InlineImage.tsx', 'max-w-full', 'min-w-0')).toBe(true);
  });

  it('keeps an inline picture at most 320px tall, its shape kept', () => {
    expect(
      hasClasses(
        'InlineImage.tsx',
        'max-h-[320px]',
        'max-w-full',
        'h-auto',
        'w-auto',
        'object-contain',
      ),
    ).toBe(true);
  });

  it('fits the emoji grid in its card: as many columns as the arrows move by, none wider', () => {
    // `grid-cols-N` is `repeat(N, minmax(0, 1fr))`: a wide glyph never widens its column.
    expect(hasClasses('EmojiPicker.tsx', `grid-cols-${COLUMNS}`, 'overflow-x-hidden')).toBe(true);
    // WebKit ignores aspect-ratio on a <button>: the rows carry the height.
    expect(hasClasses('EmojiPicker.tsx', 'auto-rows-[36px]')).toBe(true);
    expect(hasClasses('EmojiPicker.tsx', 'h-[36px]', 'min-w-0')).toBe(true);
    expect(hasClasses('EmojiPicker.tsx', 'w-[320px]')).toBe(true);
  });
});
