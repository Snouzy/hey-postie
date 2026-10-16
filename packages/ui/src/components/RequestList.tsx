import { ChevronDown, ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { useLocale, useText } from '../core/CoreProvider';
import type { RequestRow } from '../core/useRequests';
import { formatRecent } from '../i18n/dates';
import { moveWithArrows } from './ChatList';
import styles from './RequestList.module.css';

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
    <section className={styles.group}>
      <button
        type="button"
        className={styles.heading}
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <Chevron size={14} aria-hidden />
        <span className={styles.title}>{text('requests.title')}</span>
        <span className={styles.badge}>
          {rows.length}
          <span className={styles.srOnly}> {text('requests.waiting')}</span>
        </span>
      </button>
      {open && (
        <ul className={styles.list} onKeyDown={moveWithArrows}>
          {rows.map((row) => (
            <li key={row.jid}>
              <button
                type="button"
                data-row=""
                className={styles.row}
                aria-current={row.jid === selectedJid ? 'true' : undefined}
                onClick={() => onSelect(row)}
              >
                <span className={styles.top}>
                  <span className={styles.name}>{row.name}</span>
                  {row.at.getTime() > 0 && (
                    <time className={styles.time} dateTime={row.at.toISOString()}>
                      {formatRecent(locale, row.at)}
                    </time>
                  )}
                </span>
                <span className={styles.preview}>
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
