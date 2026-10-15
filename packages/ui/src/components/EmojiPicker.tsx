import { type KeyboardEvent, useEffect, useRef, useState } from 'react';
import { useText } from '../core/CoreProvider';
import { EMOJI_CATEGORIES, EMOJIS, type EmojiCategory, searchEmojis } from '../data/emoji';
import styles from './EmojiPicker.module.css';
import { Popover } from './Popover';

interface EmojiPickerProps {
  anchor: HTMLElement | null;
  onPick: (emoji: string) => void;
  onClose: () => void;
}

/** Must match `grid-template-columns` in the stylesheet: the arrows move by it. */
export const COLUMNS = 8;

const STEPS: Record<string, number> = {
  ArrowRight: 1,
  ArrowLeft: -1,
  ArrowDown: COLUMNS,
  ArrowUp: -COLUMNS,
};

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
  useEffect(() => search.current?.focus(), []);

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
      <div className={styles.picker}>
        <input
          ref={search}
          className={styles.search}
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
          <div className={styles.categories}>
            {EMOJI_CATEGORIES.map((name) => (
              <button
                key={name}
                type="button"
                className={styles.category}
                aria-pressed={name === category}
                onClick={() => setCategory(name)}
              >
                {text(`emoji.category.${name}`)}
              </button>
            ))}
          </div>
        )}
        <div ref={grid} className={styles.grid}>
          {shown.map((entry, index) => (
            <button
              key={entry.shortname}
              type="button"
              className={styles.cell}
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
          {shown.length === 0 && <p className={styles.empty}>{text('emoji.empty')}</p>}
        </div>
      </div>
    </Popover>
  );
}
