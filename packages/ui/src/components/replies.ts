import type { Message, ReplyTo } from '@hey-postie/core';

/** Who wrote the letter a reply names, as the conversation calls them. */
export function replyAuthor(
  author: Pick<ReplyTo, 'fromJid' | 'fromNick' | 'mine'>,
  peerName: string,
  you: string,
): string {
  if (author.mine) return you;
  if (author.fromNick) return author.fromNick;
  const nick = author.fromJid?.split('/')[1];
  return nick || peerName;
}

/** Who wrote a letter, as the conversation calls them: "You", the nick in a hall, the peer. */
export function messageAuthor(message: Message, peerName: string, you: string): string {
  const author = { fromJid: message.fromJid, mine: message.direction === 'out' };
  return replyAuthor(
    message.fromNick ? { ...author, fromNick: message.fromNick } : author,
    peerName,
    you,
  );
}

/** A line of a letter for a quote: its text, else the name of its parcel. */
export function replyExcerpt(message: Message): string {
  if (message.retracted || message.encryption === 'undecryptable') return '';
  return message.body.replace(/\s+/g, ' ').trim() || message.attachments[0]?.name || '';
}
