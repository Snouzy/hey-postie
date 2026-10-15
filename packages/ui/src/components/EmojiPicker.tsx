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

/**
 * Search field, categories, then a grid of buttons whose accessible name is the shortname.
 * Arrows move in the grid (Down from the search enters it), Esc closes.
 */
export function EmojiPicker({ anchor, onPick, onClose }: EmojiPickerProps) {
  const text = useText();
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<EmojiCategory>('smileys');
  const grid = useRef<HTMLDivElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const searching = query.trim().length > 0;
  const shown = searching
    ? searchEmojis(query)
    : EMOJIS.filter((entry) => entry.category === category);

  // The search field takes the focus: typing is the fastest way to an emoji.
  useEffect(() => search.current?.focus(), []);

  function focusCell(index: number) {
    const cells = grid.current?.querySelectorAll<HTMLButtonElement>('button') ?? [];
    cells[Math.max(0, Math.min(index, cells.length - 1))]?.focus();
  }

  function onCellKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    const cells = [...(grid.current?.querySelectorAll<HTMLButtonElement>('button') ?? [])];
    const index = cells.indexOf(document.activeElement as HTMLButtonElement);
    if (index < 0) return;
    const steps: Record<string, number> = {
      ArrowRight: 1,
      ArrowLeft: -1,
      ArrowDown: COLUMNS,
      ArrowUp: -COLUMNS,
    };
    const step = steps[event.key];
    if (step === undefined) return;
    event.preventDefault();
    focusCell(index + step);
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
          {shown.map((entry) => (
            <button
              key={entry.shortname}
              type="button"
              className={styles.cell}
              aria-label={entry.shortname}
              title={entry.shortname}
              onClick={() => onPick(entry.emoji)}
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
