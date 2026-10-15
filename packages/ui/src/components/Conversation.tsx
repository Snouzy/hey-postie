import type { Chat, Contact, Room } from '@hey-postie/core';
import { Info, Users } from 'lucide-react';
import { useCore, useText } from '../core/CoreProvider';
import { useEncryption } from '../core/useEncryption';
import { useFileDrop } from '../core/useFileDrop';
import { useMessages } from '../core/useMessages';
import { useRoomMembers } from '../core/useRoomMembers';
import { useUploads } from '../core/useUploads';
import { errorKey } from '../i18n/errors';
import type { SaveFile } from './Attachments';
import { Button } from './Button';
import { Composer } from './Composer';
import styles from './Conversation.module.css';
import { DropOverlay } from './DropOverlay';
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
}: ConversationProps) {
  const core = useCore();
  const text = useText();
  const letters = useMessages(chat);
  const seal = useEncryption(chat);
  const uploads = useUploads(chat.id, letters.add);
  const members = useRoomMembers(room?.jid ?? '');
  const nicks = room
    ? members.map((member) => member.nick).filter((nick) => nick !== room.nick)
    : [];
  // A hall the user is not in: left elsewhere, kicked, or bookmarked and not joined yet.
  const outside = chat.kind === 'room' && !room?.joined;
  // The details pane exists for a direct chat, or for a hall the app has a record of.
  const hasDetails = chat.kind === 'direct' || room !== undefined;
  const drop = useFileDrop((files) => !outside && uploads.add(files));
  const myJid = core.accounts.current()?.jid.split('/')[0] ?? null;

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
        myJid={myJid}
        onRetry={letters.retry}
        onOpenLink={onOpenLink}
        onReact={letters.react}
        onSaveFile={onSaveFile}
        showSenders={chat.kind === 'room'}
        onShowDevices={hasDetails ? onOpenEncryption : undefined}
        footer={uploads.uploads.map((upload) => (
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
