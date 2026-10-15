import { Fragment } from 'react';

interface LinkifyProps {
  text: string;
  onOpenLink: (url: string) => void;
}

// Only web and XMPP links; anything else stays plain text so nothing untrusted becomes clickable.
const LINK = /(https?:\/\/[^\s<>"']+|xmpp:[^\s<>"']+)/g;

/** Renders a message body as text, with its links clickable. Never HTML. */
export function Linkify({ text, onOpenLink }: LinkifyProps) {
  const parts = text.split(LINK);
  return (
    <>
      {parts.map((part, index) =>
        index % 2 === 1 ? (
          <a
            // biome-ignore lint/suspicious/noArrayIndexKey: parts are positional and never reorder
            key={index}
            href={part}
            rel="noreferrer"
            onClick={(event) => {
              event.preventDefault();
              onOpenLink(part);
            }}
          >
            {part}
          </a>
        ) : (
          // biome-ignore lint/suspicious/noArrayIndexKey: same
          <Fragment key={index}>{part}</Fragment>
        ),
      )}
    </>
  );
}
