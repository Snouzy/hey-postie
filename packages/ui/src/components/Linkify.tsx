import type { ReactNode } from 'react';
import { useCore } from '../core/CoreProvider';

interface LinkifyProps {
  text: string;
  onOpenLink: (url: string) => void;
}

// Only web and XMPP links; anything else stays plain text so nothing untrusted becomes clickable.
const LINK = /(?:https?:\/\/|xmpp:)[^\s<>"']+/g;
// Punctuation that ends a sentence is not part of the address.
const TRAILING = /[.,;:!?)]+$/;

/**
 * Renders a message body as text, with its links clickable. Never HTML. An `xmpp:` link opens
 * the chat with that address inside the app; everything else goes to `onOpenLink`.
 */
export function Linkify({ text, onOpenLink }: LinkifyProps) {
  const core = useCore();
  const parts: ReactNode[] = [];
  let cursor = 0;
  for (const match of text.matchAll(LINK)) {
    const url = match[0].replace(TRAILING, '');
    const start = match.index;
    parts.push(text.slice(cursor, start));
    parts.push(
      <a
        key={start}
        href={url}
        rel="noreferrer"
        onClick={(event) => {
          event.preventDefault();
          if (url.startsWith('xmpp:')) core.events.emit('chat.requested', { chatId: bareJid(url) });
          else onOpenLink(url);
        }}
      >
        {url}
      </a>,
    );
    cursor = start + url.length;
  }
  parts.push(text.slice(cursor));
  return <>{parts}</>;
}

/** `xmpp:bob@x.org/phone?message` → `bob@x.org`. */
function bareJid(url: string): string {
  return url.slice('xmpp:'.length).split('?')[0]?.split('/')[0] ?? '';
}
