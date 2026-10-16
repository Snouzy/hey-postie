import type { Chat, Contact, Room } from '@hey-postie/core';
import { Info, Users } from 'lucide-react';
import { useEffect } from 'react';
import { useCore, useText } from '../core/CoreProvider';
import { useEncryption } from '../core/useEncryption';
import { useFileDrop } from '../core/useFileDrop';
import { useMessages } from '../core/useMessages';
import { useRoomMembers } from '../core/useRoomMembers';
import { useTyping } from '../core/useTyping';
import type { ChatUploads } from '../core/useUploads';
import { errorKey } from '../i18n/errors';
import { Postie } from '../illustrations/Postie';
import type { SaveFile } from './Attachments';
import { Avatar } from './Avatar';
import { Button } from './Button';
import { Composer } from './Composer';
import { DropOverlay } from './DropOverlay';
import { EmptyState } from './EmptyState';
import { MessageList } from './MessageList';
import { PendingParcel } from './PendingParcel';
import { PresenceDot } from './PresenceDot';
import { SealToggle } from './SealToggle';

interface ConversationProps {
  chat: Chat;
  /** The contact behind the chat, when it is in the address book: gives the presence. */
  contact: Contact | undefined;
  /** The hall behind the chat, when it is one: gives the topic and the members. */
  room: Room | undefined;
  detailsOpen: boolean;
  onToggleDetails: () => void;
  /** Opens the details pane on its Encryption section (from a letter sealed for another device). */
  onOpenEncryption: () => void;
  onOpenLink: (url: string) => void;
  /** Where a saved parcel goes. The desktop app routes it to a file dialog. */
  onSaveFile: SaveFile;
  /** This chat's parcels on their way, held by `Main` so a chat switch loses none. */
  uploads: ChatUploads;
  /** A letter Claude prepared for this chat, waiting to land in the composer. */
  draft?: string | undefined;
  onDraftTaken?: (() => void) | undefined;
}

/** The center column: header, messages, composer. Owns the messages of the open chat. */
export function Conversation({
  chat,
  contact,
  room,
  detailsOpen,
  onToggleDetails,
  onOpenEncryption,
  onOpenLink,
  onSaveFile,
  uploads,
  draft,
  onDraftTaken,
}: ConversationProps) {
  const core = useCore();
  const text = useText();
  const letters = useMessages(chat);
  const seal = useEncryption(chat);
  const members = useRoomMembers(room?.jid ?? '');
  const typing = useTyping(chat.id);
  const typingNames = typing.map((fromJid) =>
    chat.kind === 'room' ? nickOf(fromJid) : (contact?.name ?? chat.title),
  );
  const nicks = room
    ? members.map((member) => member.nick).filter((nick) => nick !== room.nick)
    : [];
  // A hall the user is not in: left elsewhere, kicked, or bookmarked and not joined yet.
  const outside = chat.kind === 'room' && !room?.joined;
  // The details pane exists for a direct chat, or for a hall the app has a record of.
  const hasDetails = chat.kind === 'direct' || room !== undefined;
  const drop = useFileDrop(uploads.add, !outside);

  // A parcel that landed: its message joins the list and the pending bubble goes.
  useEffect(() => {
    for (const upload of uploads.list) {
      if (!upload.sent) continue;
      letters.add(upload.sent);
      uploads.dismiss(upload.id);
    }
  }, [uploads, letters.add]);

  async function joinAgain() {
    if (!room) return;
    try {
      await core.rooms.join({ jid: room.jid, nick: room.nick });
      letters.setError(null);
    } catch (caught) {
      letters.setError(errorKey(caught));
    }
  }

  return (
    // `relative`: the drop overlay covers the column. `min-h-0`: without it the column grows to its
    // messages' height instead of letting the list scroll.
    <section
      className="relative flex min-h-0 min-w-0 flex-1 flex-col bg-paper"
      aria-label={chat.title}
      {...drop.handlers}
    >
      {drop.dragging && <DropOverlay />}
      <header className="flex items-center justify-between gap-2 border-b border-line px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <Avatar name={chat.title} jid={chat.peerJid} avatarUrl={contact?.avatarUrl} />
          {contact && <PresenceDot presence={contact.presence} />}
          <h2 className="truncate text-[20px]">{chat.title}</h2>
          {/* One line; the full topic sits in the title attribute. */}
          {room && (
            <p
              className="m-0 ml-2 min-w-0 flex-1 truncate text-[13px] text-ink-muted"
              title={room.topic}
            >
              {room.topic || text('room.topicEmpty')}
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <SealToggle
            encrypted={seal.encrypted}
            pending={seal.pending}
            onToggle={() => void seal.toggle()}
          />
          {hasDetails && (
            <Button
              variant="ghost"
              onClick={onToggleDetails}
              aria-pressed={detailsOpen}
              aria-label={text(room ? 'main.members' : 'main.details')}
            >
              {room ? <Users size={18} aria-hidden /> : <Info size={18} aria-hidden />}
            </Button>
          )}
        </div>
      </header>
      {seal.error && (
        <p
          className="m-0 px-4 py-2 font-heading [font-variation-settings:'SOFT'_100] text-[14px] text-red"
          role="alert"
        >
          {text(seal.error)}
        </p>
      )}
      {/* Postie at the door of a hall the user is not in. */}
      {outside && (
        <div
          className="mx-4 mt-3 mb-0 flex flex-wrap items-center justify-between gap-2 rounded-sm bg-kraft-soft px-3 py-2 font-heading [font-variation-settings:'SOFT'_100] text-[14px]"
          role="status"
        >
          {text('room.notJoined')}
          {room && <Button onClick={() => void joinAgain()}>{text('room.joinAgain')}</Button>}
        </div>
      )}
      <MessageList
        messages={letters.messages}
        hasOlder={letters.hasOlder}
        onLoadOlder={letters.loadOlder}
        onRetry={letters.retry}
        onOpenLink={onOpenLink}
        onReact={letters.react}
        onSaveFile={onSaveFile}
        showSenders={chat.kind === 'room'}
        onShowDevices={hasDetails ? onOpenEncryption : undefined}
        empty={
          letters.loaded && (
            <EmptyState
              size="full"
              illustration={<Postie mood="writing" label={text('postie.alt.writing')} size={120} />}
              title={text('conversation.empty')}
              sentence={text('conversation.emptyHint')}
            />
          )
        }
        // A parcel that landed is already in the list: its bubble is not drawn once more.
        footer={uploads.list
          .filter((upload) => !upload.sent)
          .map((upload) => (
            <PendingParcel
              key={upload.id}
              upload={upload}
              onRetry={() => uploads.retry(upload.id)}
              onDismiss={() => uploads.dismiss(upload.id)}
            />
          ))}
      />
      {letters.error && (
        <p
          className="m-0 px-4 py-2 font-heading [font-variation-settings:'SOFT'_100] text-[14px] text-red"
          role="alert"
        >
          {text(letters.error)}
        </p>
      )}
      {/* Who is writing, just above the composer; keeps its line so the layout never jumps. */}
      <p
        className="m-0 min-h-[18px] truncate px-4 py-0 text-[13px] text-ink-muted italic"
        aria-live="polite"
      >
        {typingNames.length > 0 && typingLine(text, typingNames)}
      </p>
      <Composer
        onSend={letters.send}
        onAttach={uploads.add}
        nicks={nicks}
        disabled={outside}
        sealed={seal.encrypted}
        onComposing={(composing) => core.chats.setComposing(chat.id, composing)}
        draft={draft}
        onDraftTaken={onDraftTaken}
      />
    </section>
  );
}

/** "Bob is typing…", or "Ann, Bob are typing…" in a hall. */
function typingLine(text: (key: 'typing.one' | 'typing.many') => string, names: string[]): string {
  if (names.length === 1) return text('typing.one').replace('{name}', names[0] ?? '');
  return text('typing.many').replace('{names}', names.join(', '));
}

/** A hall occupant's JID is `room@service/nick`. */
function nickOf(fromJid: string): string {
  return fromJid.split('/')[1] ?? fromJid;
}
