import type { Chat, Contact, Message, Room } from '@hey-postie/core';
import { useEffect, useState } from 'react';
import { useCore, useText } from '../core/CoreProvider';
import { useEncryption } from '../core/useEncryption';
import { useFileDrop } from '../core/useFileDrop';
import { useMessages } from '../core/useMessages';
import { useRoomMembers } from '../core/useRoomMembers';
import { useRoomPeople } from '../core/useRoomPeople';
import { useTyping } from '../core/useTyping';
import type { ChatUploads } from '../core/useUploads';
import type { MessageKey } from '../i18n';
import { errorKey } from '../i18n/errors';
import { Postie } from '../illustrations/Postie';
import type { SaveFile } from './Attachments';
import { Button } from './Button';
import { Composer } from './Composer';
import { ConversationHeader } from './ConversationHeader';
import { DeleteMessageDialog } from './DeleteMessageDialog';
import { DropOverlay } from './DropOverlay';
import { EmptyState } from './EmptyState';
import { actionsFor, type MessageAction } from './MessageActions';
import { MessageList } from './MessageList';
import { PendingParcel } from './PendingParcel';
import { RoomIntro } from './RoomIntro';
import { useReply } from './useReply';

interface ConversationProps {
  chat: Chat;
  /** The contact behind the chat, when it is in the address book: gives the presence. */
  contact: Contact | undefined;
  /** The hall behind the chat, when it is one: gives the topic and the members. */
  room: Room | undefined;
  detailsOpen: boolean;
  onToggleDetails: () => void;
  /** Opens the hall's pane on its People section (the header's people button). */
  onOpenPeople?: (() => void) | undefined;
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
  /** "Invite people" from a new hall's intro. */
  onInvite?: (() => void) | undefined;
}

/** The center column: header, messages, composer. Owns the messages of the open chat. */
export function Conversation({
  chat,
  contact,
  room,
  detailsOpen,
  onToggleDetails,
  onOpenPeople,
  onOpenEncryption,
  onOpenLink,
  onSaveFile,
  uploads,
  draft,
  onDraftTaken,
  onInvite,
}: ConversationProps) {
  const core = useCore();
  const text = useText();
  const letters = useMessages(chat);
  const seal = useEncryption(chat);
  const members = useRoomMembers(room?.jid ?? '');
  const { people } = useRoomPeople(room?.jid ?? '');
  const typing = useTyping(chat.id);
  const peerName = contact?.name ?? chat.title;
  const typingNames = typing.map((fromJid) => (chat.kind === 'room' ? nickOf(fromJid) : peerName));
  // Who `@` and Tab can name: the hall's people with a nick, present or away, except me.
  const mentionable = room
    ? people.flatMap((person) =>
        person.nick && person.nick !== room.nick
          ? [{ nick: person.nick, present: person.present }]
          : [],
      )
    : [];
  // The first unread letter as it was when the chat opened: `Main` marks it read right after.
  const [newFrom] = useState(chat.firstUnreadId);
  const reply = useReply(chat.id, letters.messages, peerName);
  // A hall the user is not in: left elsewhere, kicked, or bookmarked and not joined yet.
  const outside = chat.kind === 'room' && !room?.joined;
  // The details pane exists for a direct chat, or for a hall the app has a record of.
  const hasDetails = chat.kind === 'direct' || room !== undefined;
  const drop = useFileDrop(uploads.add, !outside);
  const [editing, setEditing] = useState<{ id: string; body: string } | undefined>(undefined);
  const [confirming, setConfirming] = useState<{
    message: Message;
    kind: 'deleteForEveryone' | 'moderate';
  } | null>(null);
  const self = room ? members.find((member) => member.nick === room.nick) : undefined;
  const canModerate = self?.role === 'moderator';
  // Owners, admins and moderators may change the topic; a standing still unknown may try.
  const topicEditable =
    !!room?.joined &&
    (canModerate ||
      room.affiliation === 'owner' ||
      room.affiliation === 'admin' ||
      (!self && room.affiliation === undefined));
  const [topicError, setTopicError] = useState<MessageKey | null>(null);
  const headerError = seal.error ?? topicError;

  /** Enter sends a new letter (a reply, when one is under way), or saves the correction. */
  async function sendOrSave(body: string) {
    if (editing) {
      await core.chats.edit(chat.id, editing.id, body);
      setEditing(undefined);
      return;
    }
    await letters.send(body, reply.replying?.id);
    reply.replyTo(undefined);
  }

  /** ↑ in an empty composer: my last letter that can still be corrected. */
  function editLast() {
    const last = [...letters.messages]
      .reverse()
      .find((message) => actionsFor(message, false).includes('edit'));
    if (last) setEditing({ id: last.id, body: last.body });
  }

  function act(message: Message, action: Exclude<MessageAction, 'copy'>) {
    if (action === 'edit') setEditing({ id: message.id, body: message.body });
    else if (action === 'reply') reply.replyTo(message);
    else if (action === 'deleteForMe') {
      core.chats
        .hideForMe(chat.id, message.id)
        .catch((caught: unknown) => letters.setError(errorKey(caught)));
    } else setConfirming({ message, kind: action });
  }

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
      <ConversationHeader
        chat={chat}
        contact={contact}
        room={room}
        topicEditable={topicEditable}
        onTopicError={setTopicError}
        seal={seal}
        peopleCount={members.length}
        onOpenPeople={onOpenPeople}
        hasDetails={hasDetails}
        detailsOpen={detailsOpen}
        onToggleDetails={onToggleDetails}
      />
      {headerError && (
        <p
          className="m-0 px-4 py-2 font-heading [font-variation-settings:'SOFT'_100] text-[14px] text-red"
          role="alert"
        >
          {text(headerError)}
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
        onAction={act}
        canModerate={canModerate}
        canReply={!outside}
        newFrom={newFrom}
        peerName={peerName}
        ownNick={room?.nick}
        onSaveFile={onSaveFile}
        showSenders={chat.kind === 'room'}
        onShowDevices={hasDetails ? onOpenEncryption : undefined}
        empty={
          letters.loaded &&
          (room ? (
            // A hall's first page: where it starts, and who to bring in.
            <RoomIntro room={room} onInvite={room.joined ? onInvite : undefined} />
          ) : (
            <EmptyState
              size="full"
              illustration={<Postie mood="writing" label={text('postie.alt.writing')} size={120} />}
              title={text('conversation.empty')}
              sentence={text('conversation.emptyHint')}
            />
          ))
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
        chatId={chat.id}
        onSend={sendOrSave}
        editing={editing}
        onCancelEdit={() => setEditing(undefined)}
        onEditLast={editLast}
        onAttach={uploads.add}
        people={mentionable}
        disabled={outside}
        sealed={seal.encrypted}
        onComposing={(composing) => core.chats.setComposing(chat.id, composing)}
        draft={draft}
        onDraftTaken={onDraftTaken}
        replying={reply.banner}
        onCancelReply={() => reply.replyTo(undefined)}
      />
      {confirming && (
        <DeleteMessageDialog
          kind={confirming.kind}
          onClose={() => setConfirming(null)}
          onConfirm={(reason) =>
            confirming.kind === 'moderate'
              ? core.rooms.moderate(chat.id, confirming.message.id, reason)
              : core.chats.retract(chat.id, confirming.message.id)
          }
        />
      )}
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
