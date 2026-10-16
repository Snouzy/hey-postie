import type { Message } from '@hey-postie/core';
import { useRef, useState } from 'react';
import { useLocale, useText } from '../core/CoreProvider';
import { formatTime } from '../i18n/dates';
import { Popover } from './Popover';

/**
 * The "edited" mark of a corrected letter. With earlier texts known, it is a button that shows
 * them, oldest first, each with its time: what the letter said before each correction.
 */
export function EditHistory({ message }: { message: Message }) {
  const text = useText();
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const versions = message.versions ?? [];

  if (versions.length === 0) return <span>{text('message.edited')}</span>;
  return (
    <>
      <button
        ref={button}
        type="button"
        className="cursor-pointer border-none bg-transparent p-0 text-[11px] text-current underline decoration-dotted"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        {text('message.edited')}
      </button>
      {open && (
        <Popover
          anchor={button.current}
          label={text('message.versions')}
          onClose={() => {
            setOpen(false);
            button.current?.focus();
          }}
        >
          <div className="flex max-w-[320px] flex-col gap-2 text-ink">
            <p className="m-0 text-[12px] font-bold tracking-[0.04em] text-ink-muted uppercase">
              {text('message.versions')}
            </p>
            <ol className="m-0 flex list-none flex-col gap-2 p-0">
              {versions.map((version) => (
                <li key={version.at.toISOString()} className="flex flex-col gap-[2px]">
                  <time className="text-[11px] text-ink-muted" dateTime={version.at.toISOString()}>
                    {formatTime(locale, version.at)}
                  </time>
                  <span className="whitespace-pre-wrap wrap-anywhere line-through decoration-ink-muted/60">
                    {version.body}
                  </span>
                </li>
              ))}
            </ol>
          </div>
        </Popover>
      )}
    </>
  );
}
