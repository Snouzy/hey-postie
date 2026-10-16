import type { Chat, Contact, Room } from '@hey-postie/core';
import { Info, Users } from 'lucide-react';
import { useEffect } from 'react';
import { useCore, useText } from '../core/CoreProvider';
import { useEncryption } from '../core/useEncryption';
import { useFileDrop } from '../core/useFileDrop';
import { useMessages } from '../core/useMessages';
import { useRoomMembers } from '../core/useRoomMembers';
import type { ChatUploads } from '../core/useUploads';
import { errorKey } from '../i18n/errors';
import { Postie } from '../illustrations/Postie';
import type { SaveFile } from './Attachments';
import { Button } from './Button';
import { Composer } from './Composer';
import styles from './Conversation.module.css';
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
}: ConversationProps) {
  const core = useCore();
  const text = useText();
  const letters = useMessages(chat);
  const seal = useEncryption(chat);
  const members = useRoomMembers(room?.jid ?? '');
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
    <section className={styles.conversation} aria-label={chat.title} {...drop.handlers}>
      {drop.dragging && <DropOverlay />}
      <header className={styles.header}>
        <div className={styles.peer}>
          {contact && <PresenceDot presence={contact.presence} />}
          <h2 className={styles.title}>{chat.title}</h2>
          {room && (
            <p className={styles.topic} title={room.topic}>
              {room.topic || text('room.topicEmpty')}
            </p>
          )}
        </div>
        <div className={styles.tools}>
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
        <p className={styles.error} role="alert">
          {text(seal.error)}
        </p>
      )}
      {outside && (
        <div className={styles.outside} role="status">
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
        <p className={styles.error} role="alert">
          {text(letters.error)}
        </p>
      )}
      <Composer
        onSend={letters.send}
        onAttach={uploads.add}
        nicks={nicks}
        disabled={outside}
        sealed={seal.encrypted}
      />
    </section>
  );
}
