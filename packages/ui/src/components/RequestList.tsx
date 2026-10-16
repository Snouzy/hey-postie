import { ChevronDown, ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { useLocale, useText } from '../core/CoreProvider';
import type { RequestRow } from '../core/useRequests';
import { formatRecent } from '../i18n/dates';
import { moveWithArrows } from './ChatList';
import { GROUP_BADGE as BADGE, GROUP_HEADING as HEADING, GROUP_ROW as ROW } from './SidebarGroup';

interface RequestListProps {
  rows: RequestRow[];
  selectedJid: string | null;
  onSelect: (row: RequestRow) => void;
}

/**
 * The "Letters from strangers" group above the chats: a heading button with the count, folded by
 * default, then one row per stranger. Arrow keys move between rows like in the chat list.
 */
export function RequestList({ rows, selectedJid, onSelect }: RequestListProps) {
  const text = useText();
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  if (rows.length === 0) return null;
  const Chevron = open ? ChevronDown : ChevronRight;

  return (
    <section className="mb-2 border-b border-line px-2 pt-0 pb-2">
      <button type="button" className={HEADING} aria-expanded={open} onClick={() => setOpen(!open)}>
        <Chevron size={14} aria-hidden />
        <span className="flex-1">{text('requests.title')}</span>
        <span className={BADGE}>
          {rows.length}
          <span className="sr-only"> {text('requests.waiting')}</span>
        </span>
      </button>
      {open && (
        <ul className="m-0 flex list-none flex-col gap-[2px] p-0" onKeyDown={moveWithArrows}>
          {rows.map((row) => (
            <li key={row.jid}>
              <button
                type="button"
                data-row=""
                className={ROW}
                aria-current={row.jid === selectedJid ? 'true' : undefined}
                onClick={() => onSelect(row)}
              >
                <span className="flex w-full items-center justify-between gap-2">
                  <span className="min-w-0 flex-1 truncate font-semibold">{row.name}</span>
                  {row.at.getTime() > 0 && (
                    <time
                      className="shrink-0 text-[12px] text-ink-muted"
                      dateTime={row.at.toISOString()}
                    >
                      {formatRecent(locale, row.at)}
                    </time>
                  )}
                </span>
                <span className="w-full truncate text-[13px] text-ink-muted">
                  {row.message ?? row.chat?.lastMessage?.body ?? row.jid}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
