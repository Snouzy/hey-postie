import { useRef, useState } from 'react';

/** Older pages loaded, at most, to reach a letter asked for (50 letters each). */
export const JUMP_PAGES = 20;

export interface Jump {
  id: string;
  seq: number;
  keepFocus?: boolean;
}

/**
 * Showing a letter that may not be loaded yet (a search hit, an item of the archive): older pages
 * load until it is there (`JUMP_PAGES` at most), then the list scrolls to it (`MessageList`'s
 * `jump`). Requests run one after the other, and only the latest moves the view.
 */
export function useLetterJump(loadUntil: (id: string, pages: number) => Promise<boolean>) {
  const [jump, setJump] = useState<Jump | undefined>(undefined);
  const latest = useRef(0);
  const queue = useRef<Promise<unknown>>(Promise.resolve());

  /** Whether the letter could be loaded (and so shown). `keepFocus`: the reader stays put. */
  function show(id: string, keepFocus = false): Promise<boolean> {
    const seq = ++latest.current;
    const found = queue.current.then(() => loadUntil(id, JUMP_PAGES));
    queue.current = found.catch(() => false);
    return found.then((loaded) => {
      if (loaded && seq === latest.current) setJump({ id, seq, keepFocus });
      return loaded;
    });
  }

  return { jump, show };
}
