import type { Message } from '@hey-postie/core';
import { useLocale, useText } from '../core/CoreProvider';
import { formatWhen } from '../i18n/dates';
import { messageAuthor } from './replies';

interface ArchiveMetaProps {
  message: Message;
  peerName: string;
  /** Said first, before who and when (a document's size). */
  lead?: string | undefined;
}

/** "Bob · Yesterday, 14:02": who sent an item of the archive, and when. */
export function ArchiveMeta({ message, peerName, lead }: ArchiveMetaProps) {
  const text = useText();
  const locale = useLocale();
  const parts = [
    lead,
    messageAuthor(message, peerName, text('reply.you')),
    formatWhen(locale, message.sentAt, text),
  ];
  return (
    <span className="truncate text-[12px] text-ink-muted">
      {parts.filter((part) => part).join(' · ')}
    </span>
  );
}
