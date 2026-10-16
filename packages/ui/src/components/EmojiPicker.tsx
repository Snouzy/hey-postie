import { type KeyboardEvent, useCallback, useEffect, useRef, useState } from 'react';
import { useText } from '../core/CoreProvider';
import { EMOJI_CATEGORIES, EMOJIS, type EmojiCategory, searchEmojis } from '../data/emoji';
import { Popover } from './Popover';

interface EmojiPickerProps {
  anchor: HTMLElement | null;
  onPick: (emoji: string) => void;
  onClose: () => void;
}

/** Must match `grid-cols-8` of the grid: the arrows move by it. */
export const COLUMNS = 8;

const STEPS: Record<string, number> = {
  ArrowRight: 1,
  ArrowLeft: -1,
  ArrowDown: COLUMNS,
  ArrowUp: -COLUMNS,
};

const SEARCH =
  'rounded-full border border-line-strong bg-paper px-3 py-1 text-ink focus-visible:border-navy';
const CATEGORIES =
  'flex flex-nowrap gap-1 overflow-x-auto overflow-y-hidden scroll-smooth [scrollbar-width:none] motion-reduce:scroll-auto [&::-webkit-scrollbar]:hidden';
// Toggle buttons, like the sidebar tabs: the pressed one wears the navy underline.
const CATEGORY =
  'flex-none cursor-pointer border-0 border-b-2 border-transparent bg-transparent px-2 py-[2px] text-[12px] whitespace-nowrap text-ink-muted aria-pressed:border-b-navy aria-pressed:text-navy';
// grid-cols-8 is repeat(8, minmax(0, 1fr)): a wide glyph (a flag, a family) never widens its
// column past the card. Rows get an explicit height: `aspect-ratio` on a <button> is not honoured
// by WebKit, and a cell without padding would then be only as tall as its glyph.
const GRID =
  'grid max-h-[240px] auto-rows-[36px] grid-cols-8 gap-1 overflow-x-hidden overflow-y-auto';
const CELL =
  'inline-flex h-[36px] min-w-0 cursor-pointer items-center justify-center overflow-hidden rounded-sm border-0 bg-transparent p-0 text-[22px] leading-[1] hover:bg-paper focus-visible:bg-paper';
const EMPTY =
  "col-span-full mx-0 my-2 text-center font-heading text-[14px] text-ink-muted [font-variation-settings:'SOFT'_100]";

/**
 * Search field, categories, then a grid of buttons whose accessible name is the shortname. The
 * grid is one Tab stop (roving tabindex): arrows move inside it, Down from the search enters it,
 * Esc closes.
 */
export function EmojiPicker({ anchor, onPick, onClose }: EmojiPickerProps) {
  const text = useText();
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<EmojiCategory>('smileys');
  const [active, setActive] = useState(0);
  const grid = useRef<HTMLDivElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const searching = query.trim().length > 0;
  const shown = searching
    ? searchEmojis(query)
    : EMOJIS.filter((entry) => entry.category === category);
  // A shorter list after a search or a category change: the stop stays inside it.
  const current = Math.min(active, Math.max(0, shown.length - 1));

  // The search field takes the focus: typing is the fastest way to an emoji.
  useEffect(() => search.current?.focus({ preventScroll: true }), []);

  // The categories sit on one line that scrolls sideways; a fade on an edge says "more this way".
  const strip = useRef<HTMLDivElement>(null);
  const [fade, setFade] = useState<Fade>('none');
  const measure = useCallback(() => setFade(edgeFade(strip.current)), []);
  useEffect(() => {
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [measure]);
  useEffect(() => {
    // Optional call: jsdom has no scrollIntoView.
    strip.current
      ?.querySelector<HTMLElement>(`[data-category="${category}"]`)
      ?.scrollIntoView?.({ inline: 'nearest', block: 'nearest' });
  }, [category]);

  function focusCell(index: number) {
    const bounded = Math.max(0, Math.min(index, shown.length - 1));
    setActive(bounded);
    grid.current?.querySelectorAll<HTMLButtonElement>('button')[bounded]?.focus();
  }

  function onCellKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    const step = STEPS[event.key];
    if (step === undefined) return;
    event.preventDefault();
    focusCell(current + step);
  }

  return (
    <Popover anchor={anchor} label={text('emoji.title')} onClose={onClose}>
      <div className="flex w-[320px] flex-col gap-2">
        <input
          ref={search}
          className={SEARCH}
          type="search"
          value={query}
          placeholder={text('emoji.search')}
          aria-label={text('emoji.search')}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== 'ArrowDown') return;
            event.preventDefault();
            focusCell(0);
          }}
        />
        {!searching && (
          <div className="hp-emoji-strip" data-fade={fade}>
            <div ref={strip} className={CATEGORIES} onScroll={measure}>
              {EMOJI_CATEGORIES.map((name) => (
                <button
                  key={name}
                  type="button"
                  className={CATEGORY}
                  data-category={name}
                  aria-pressed={name === category}
                  onClick={() => setCategory(name)}
                >
                  {text(`emoji.category.${name}`)}
                </button>
              ))}
            </div>
          </div>
        )}
        <div ref={grid} className={GRID}>
          {shown.map((entry, index) => (
            <button
              key={entry.shortname}
              type="button"
              className={CELL}
              tabIndex={index === current ? 0 : -1}
              aria-label={entry.shortname}
              title={entry.shortname}
              onClick={() => onPick(entry.emoji)}
              onFocus={() => setActive(index)}
              onKeyDown={onCellKeyDown}
            >
              {entry.emoji}
            </button>
          ))}
          {shown.length === 0 && <p className={EMPTY}>{text('emoji.empty')}</p>}
        </div>
      </div>
    </Popover>
  );
}

type Fade = 'none' | 'left' | 'right' | 'both';

/** Which edges of a sideways scroller hide more content. Exported for the test. */
export function edgeFade(element: HTMLElement | null): Fade {
  if (!element) return 'none';
  const left = element.scrollLeft > 0;
  const right = element.scrollLeft + element.clientWidth < element.scrollWidth - 1;
  if (left && right) return 'both';
  if (left) return 'left';
  if (right) return 'right';
  return 'none';
}
