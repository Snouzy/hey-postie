import type { Message } from '@hey-postie/core';
import { Stamp } from 'lucide-react';
import { useText } from '../core/CoreProvider';
import { Attachments, type SaveFile } from './Attachments';
import { Button } from './Button';
import { LinkPreviews } from './LinkPreviews';
import { MessageText } from './MessageText';
import { SMALL_ACTION } from './messageParts';
import { Reactions } from './Reactions';
import { ReplyQuote } from './ReplyQuote';

const BODY = 'm-0 whitespace-pre-wrap wrap-anywhere';
const SEALED = `${BODY} flex items-center gap-2 font-heading [font-variation-settings:'SOFT'_100] italic text-ink-muted`;
// A letter taken back or removed: its place stays, in Postie's quiet italic.
const GONE = `${BODY} font-heading [font-variation-settings:'SOFT'_100] italic opacity-80`;
// What to do with a letter I cannot open: plain text, and a way to the sender's devices.
const HELP = 'm-0 flex flex-wrap items-center gap-2 text-[13px] text-ink-muted';

export interface MessageBodyProps {
  message: Message;
  onOpenLink: (url: string) => void;
  onReact: (message: Message, emoji: string) => void;
  onSaveFile: SaveFile;
  /** From a letter sealed for another device: opens the sender's devices in the details pane. */
  onShowDevices?: (() => void) | undefined;
  /** My nick in a hall: the mention chip naming me stands out. */
  ownNick?: string | undefined;
  /** The author of the letter this one answers, as the conversation calls them. */
  replyAuthor?: string | undefined;
  /** Scrolls to the letter this one answers; absent when it is not loaded. */
  onJumpToReply?: (() => void) | undefined;
}

/**
 * What a letter says, the same in both layouts: the quote it answers, its text (or why there is
 * none), its parcels, the hall's link previews and the reactions. `onNavy` is a bubble of mine.
 */
export function MessageBody({
  message,
  onOpenLink,
  onReact,
  onSaveFile,
  onShowDevices,
  ownNick,
  replyAuthor,
  onJumpToReply,
  onNavy,
}: MessageBodyProps & { onNavy: boolean }) {
  const text = useText();
  const sealed = message.encryption === 'undecryptable';
  // A parcel alone travels with an empty body: no empty line above the card.
  const hasBody =
    !message.retracted && (sealed || message.body.length > 0 || message.attachments.length === 0);

  return (
    <>
      {message.replyTo && !message.retracted && (
        <ReplyQuote replyTo={message.replyTo} author={replyAuthor ?? ''} onJump={onJumpToReply} />
      )}
      {message.retracted && (
        <p className={GONE}>
          {text(message.retractedBy === 'moderator' ? 'message.removed' : 'message.deleted')}
          {message.moderationReason && ` (${message.moderationReason})`}
        </p>
      )}
      {hasBody &&
        (sealed ? (
          <p className={SEALED}>
            <Stamp size={16} className="shrink-0 text-red" aria-hidden />
            {text('message.undecryptable')}
          </p>
        ) : (
          <MessageText
            className={BODY}
            body={message.body}
            mentions={message.mentions}
            ownNick={ownNick}
            outgoing={onNavy}
            unstyled={message.unstyled}
            onOpenLink={onOpenLink}
          />
        ))}
      {sealed && (
        <p className={HELP}>
          {text('message.undecryptableHelp')}
          {onShowDevices && (
            <Button className={SMALL_ACTION} onClick={onShowDevices}>
              {text('message.checkDevices')}
            </Button>
          )}
        </p>
      )}
      <Attachments message={message} onSaveFile={onSaveFile} />
      <LinkPreviews message={message} onOpenLink={onOpenLink} />
      <Reactions reactions={message.reactions} onToggle={(emoji) => onReact(message, emoji)} />
    </>
  );
}
