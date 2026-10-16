import type { ArchiveCursor, SearchHit } from '@hey-postie/core';
import { ChevronDown, ChevronUp, Search, X } from 'lucide-react';
import { type KeyboardEvent, useEffect, useRef, useState } from 'react';
import { useCore, useText } from '../core/CoreProvider';
import type { MessageKey } from '../i18n';
import { Button } from './Button';
import { HitPreview } from './HitPreview';

/** How long the typing must pause before the conversation is searched. */
export const SEARCH_DEBOUNCE_MS = 250;

const FIELD =
  'flex min-w-0 flex-1 items-center gap-2 rounded-full border border-line-strong bg-paper-raised px-3 text-ink-muted focus-within:border-navy focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-navy';
const INPUT = 'min-w-0 flex-1 border-none bg-transparent px-0 py-[6px] text-ink outline-none';
const STATUS = 'm-0 shrink-0 text-[13px] text-ink-muted tabular-nums';
const LINK =
  'cursor-pointer self-start border-none bg-transparent p-0 text-[13px] font-semibold text-navy underline-offset-2 hover:underline';

type Status = 'idle' | 'searching' | 'done';

interface ConversationSearchProps {
  chatId: string;
  /** What the conversation calls the peer of a direct chat (the author of their letters). */
  peerName: string;
  /** Brings a letter into view in the list (loading older pages if needed): whether it could. */
  onShow: (messageId: string) => Promise<boolean>;
  /** Esc or the X; the conversation puts the focus back in the composer. */
  onClose: () => void;
}

/**
 * The search bar over the letters (spec 2026-10-16 read sync and search, section 2): newest hit
 * first, Enter or ↓ the next (older) one, ⇧Enter or ↑ the previous, each shown in the list. The
 * service looks at a batch of letters per call; "Search older messages" asks for the next batch.
 */
export function ConversationSearch({ chatId, peerName, onShow, onClose }: ConversationSearchProps) {
  const core = useCore();
  const text = useText();
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [next, setNext] = useState<ArchiveCursor | undefined>(undefined);
  const [index, setIndex] = useState(0);
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<MessageKey | null>(null);
  // Each new query outdates the answers still on their way.
  const request = useRef(0);

  // biome-ignore lint/correctness/useExhaustiveDependencies: a new query (not a new `onShow`) starts a search
  useEffect(() => {
    const asked = ++request.current;
    setHits([]);
    setNext(undefined);
    setIndex(0);
    setError(null);
    if (!query.trim()) {
      setStatus('idle');
      return;
    }
    setStatus('searching');
    const timer = setTimeout(() => {
      core.archive
        .search(chatId, query)
        .then((page) => {
          if (asked !== request.current) return;
          setHits(page.items);
          setNext(page.next);
          setStatus('done');
          choose(0, page.items);
        })
        .catch(() => {
          if (asked !== request.current) return;
          setStatus('idle');
          setError('search.failed');
        });
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [core, chatId, query]);

  /** The hit at `at` becomes the current one, and its letter comes into view. */
  function choose(at: number, list = hits) {
    const hit = list[at];
    if (!hit) return;
    setIndex(at);
    setError(null);
    void onShow(hit.message.id).then((shown) => {
      if (!shown) setError('search.notFound');
    });
  }

  async function searchOlder() {
    if (!next || status === 'searching') return;
    const asked = request.current;
    setStatus('searching');
    setError(null);
    try {
      const page = await core.archive.search(chatId, query, next);
      if (asked !== request.current) return;
      const all = [...hits, ...page.items];
      setHits(all);
      setNext(page.next);
      setStatus('done');
      // The first of the newly found, the one after the last the reader saw.
      if (page.items.length > 0) choose(hits.length, all);
    } catch {
      if (asked !== request.current) return;
      setStatus('done');
      setError('search.failed');
    }
  }

  function older() {
    if (index < hits.length - 1) choose(index + 1);
    else void searchOlder();
  }

  function newer() {
    if (index > 0) choose(index - 1);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Escape') {
      // Esc closes the bar and nothing else (not the details pane, see `useMainShortcuts`).
      event.preventDefault();
      event.stopPropagation();
      onClose();
    } else if ((event.key === 'Enter' && !event.shiftKey) || event.key === 'ArrowDown') {
      event.preventDefault();
      older();
    } else if ((event.key === 'Enter' && event.shiftKey) || event.key === 'ArrowUp') {
      event.preventDefault();
      newer();
    }
  }

  const current = hits[index];
  const atLast = hits.length === 0 || index >= hits.length - 1;
  return (
    <search className="flex flex-col gap-1 border-b border-line bg-paper px-4 py-2">
      <div className="flex items-center gap-1">
        <label className={FIELD}>
          <Search size={16} aria-hidden />
          <input
            className={INPUT}
            type="search"
            // The bar opens to be typed in.
            // biome-ignore lint/a11y/noAutofocus: opened by ⌘F or the header's button, for typing
            autoFocus
            aria-label={text('search.field')}
            placeholder={text('search.placeholder')}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={onKeyDown}
          />
        </label>
        <p className={STATUS} aria-live="polite">
          {statusLine(text, status, index, hits.length, next !== undefined)}
        </p>
        <Button
          variant="ghost"
          onClick={newer}
          disabled={index === 0 || hits.length === 0}
          aria-label={text('search.previous')}
          title={text('search.previous')}
        >
          <ChevronUp size={18} aria-hidden />
        </Button>
        <Button
          variant="ghost"
          onClick={older}
          disabled={atLast && !next}
          aria-label={text('search.next')}
          title={text('search.next')}
        >
          <ChevronDown size={18} aria-hidden />
        </Button>
        <Button
          variant="ghost"
          onClick={onClose}
          aria-label={text('search.close')}
          title={text('search.close')}
        >
          <X size={18} aria-hidden />
        </Button>
      </div>
      {current && <HitPreview hit={current} peerName={peerName} onShow={() => choose(index)} />}
      {error && (
        <p
          className="m-0 font-heading text-[13px] text-red [font-variation-settings:'SOFT'_100]"
          role="alert"
        >
          {text(error)}
        </p>
      )}
      {next && atLast && status === 'done' && (
        <button type="button" className={LINK} onClick={() => void searchOlder()}>
          {text('search.older')}
        </button>
      )}
    </search>
  );
}

/** "3 of 12", "Searching…" or "No match". */
function statusLine(
  text: (key: MessageKey) => string,
  status: Status,
  index: number,
  total: number,
  more: boolean,
): string {
  if (status === 'idle') return '';
  if (status === 'searching') return text('search.searching');
  if (total === 0) return text(more ? 'search.noneRecent' : 'search.none');
  return text('search.position')
    .replace('{n}', String(index + 1))
    .replace('{total}', String(total));
}
