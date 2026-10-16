import type { Chat, Contact, Message, Room, RoomMember } from '@hey-postie/core';

/**
 * How Claude reads Hey Postie: one short line per item, readable names next to the JIDs, and every
 * message body fenced in `<message>…</message>`. Bodies come from other people and are untrusted:
 * the fence (and the server instructions) mark them as data, never as instructions.
 */

/** A body inside its fence; a `<message` or `</message` written by the sender cannot close it. */
export function fenced(body: string): string {
  return `<message>${body.replace(/<(\/?)message/gi, '&lt;$1message')}</message>`;
}

function time(date: Date): string {
  return date.toISOString().slice(0, 16).replace('T', ' ');
}

export function messageText(message: Message): string {
  if (message.retracted) return '(deleted)';
  if (message.encryption === 'undecryptable')
    return '(sealed letter, cannot be read on this device)';
  const files = message.attachments.map((file) => `[file: ${file.name}, ${file.size} bytes]`);
  return [message.body ? fenced(message.body) : '', ...files].filter(Boolean).join(' ');
}

export function messageLine(message: Message, names: Map<string, string>): string {
  const from =
    message.direction === 'out'
      ? 'You'
      : `${message.fromNick ?? names.get(message.fromJid) ?? message.fromJid} (${message.fromJid})`;
  const reactions = message.reactions.map((r) => `${r.emoji}${r.fromJids.length}`).join(' ');
  const extras = [message.edited ? 'edited' : '', reactions].filter(Boolean).join(' · ');
  return `${message.id} · ${time(message.sentAt)} · ${from}: ${messageText(message)}${extras ? ` · ${extras}` : ''}`;
}

export function chatLine(chat: Chat): string {
  const parts = [
    chat.id,
    chat.title,
    chat.kind === 'room' ? 'hall' : 'direct',
    chat.unreadCount > 0 ? `${chat.unreadCount} unread` : '',
    chat.encrypted ? 'sealed' : '',
    chat.isRequest ? 'message request from a stranger' : '',
  ].filter(Boolean);
  const last = chat.lastMessage
    ? ` · last ${time(chat.lastMessage.sentAt)}: ${messageText(chat.lastMessage)}`
    : '';
  return `${parts.join(' · ')}${last}`;
}

export function contactLine(contact: Contact): string {
  return `${contact.jid} · ${contact.name} · ${contact.presence}`;
}

export function memberLine(member: RoomMember): string {
  return `${member.nick}${member.jid ? ` (${member.jid})` : ''} · ${member.role} · ${member.affiliation}`;
}

export function roomLines(room: Room): string[] {
  return [`Topic: ${room.topic ? fenced(room.topic) : '(none)'}`, `Notify: ${room.notify}`];
}
