import type { Message } from '@hey-postie/core';
import { useState } from 'react';
import { useText } from '../core/CoreProvider';
import { readReply, writeReply } from '../core/drafts';
import { messageAuthor, replyExcerpt } from './replies';

/**
 * The letter the chat's draft answers (spec 2026-10-17, Lot B item 9): kept with the draft when
 * the user goes elsewhere (`core/drafts.ts`), shown above the composer as the list has it now.
 */
export function useReply(chatId: string, messages: Message[], peerName: string) {
  const text = useText();
  const [replying, setReplying] = useState(() => readReply(chatId));

  /** `undefined`: the reply was sent or cancelled. */
  function replyTo(message: Message | undefined) {
    writeReply(chatId, message);
    setReplying(message);
  }

  const current = replying && (messages.find((m) => m.id === replying.id) ?? replying);
  const banner = current && {
    id: current.id,
    name: messageAuthor(current, peerName, text('reply.you')),
    self: current.direction === 'out',
    excerpt: replyExcerpt(current),
  };
  return { replying: current, replyTo, banner };
}
