import type { Chat, Contact, Room } from '@hey-postie/core';
import { Ellipsis, Info, Users } from 'lucide-react';
import { useText } from '../core/CoreProvider';
import type { MessageKey } from '../i18n';
import { Avatar } from './Avatar';
import { Button } from './Button';
import { HallTopic } from './HallTopic';
import { PresenceDot } from './PresenceDot';
import { SealToggle } from './SealToggle';

const PEOPLE =
  'flex h-8 cursor-pointer items-center gap-1 rounded-sm border border-line-strong bg-transparent px-2 text-[13px] font-semibold text-ink-muted tabular-nums transition-[background-color,color] duration-(--motion-fast) hover:bg-fill-hover hover:text-ink';

interface ConversationHeaderProps {
  chat: Chat;
  contact: Contact | undefined;
  room: Room | undefined;
  /** Whether the user may change the hall's topic in place. */
  topicEditable: boolean;
  onTopicError: (key: MessageKey | null) => void;
  seal: { encrypted: boolean; pending: boolean; toggle: () => Promise<void> };
  /** How many people the hall has now (the people button). */
  peopleCount: number;
  onOpenPeople?: (() => void) | undefined;
  /** A direct chat, or a hall the app has a record of: the "i" or "⋯" button. */
  hasDetails: boolean;
  detailsOpen: boolean;
  onToggleDetails: () => void;
}

/** The conversation's top bar: who, the hall's topic, the seal, the people and the details. */
export function ConversationHeader({
  chat,
  contact,
  room,
  topicEditable,
  onTopicError,
  seal,
  peopleCount,
  onOpenPeople,
  hasDetails,
  detailsOpen,
  onToggleDetails,
}: ConversationHeaderProps) {
  const text = useText();
  const peopleLabel = text('room.peopleButton').replace('{count}', String(peopleCount));
  return (
    <header className="flex items-center justify-between gap-2 border-b border-line px-4 py-3">
      <div className="flex min-w-0 items-center gap-2">
        <Avatar name={chat.title} jid={chat.peerJid} avatarUrl={contact?.avatarUrl} />
        {contact && <PresenceDot presence={contact.presence} />}
        <h2 className="truncate text-[20px]">{chat.title}</h2>
        {room && <HallTopic room={room} editable={topicEditable} onError={onTopicError} />}
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <SealToggle
          encrypted={seal.encrypted}
          pending={seal.pending}
          onToggle={() => void seal.toggle()}
        />
        {room && onOpenPeople && (
          <button
            type="button"
            className={PEOPLE}
            aria-label={peopleLabel}
            title={peopleLabel}
            onClick={onOpenPeople}
          >
            <Users size={16} aria-hidden />
            {peopleCount}
          </button>
        )}
        {hasDetails && (
          <Button
            variant="ghost"
            onClick={onToggleDetails}
            aria-pressed={detailsOpen}
            aria-label={text(room ? 'room.panel' : 'main.details')}
            title={text(room ? 'room.panel' : 'main.details')}
          >
            {room ? <Ellipsis size={18} aria-hidden /> : <Info size={18} aria-hidden />}
          </Button>
        )}
      </div>
    </header>
  );
}
