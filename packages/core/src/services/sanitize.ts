import type { Mention, Message, Reaction, ReplyTo } from '../contracts/types';
import { stripControlCharacters } from './text';

/** The longest excerpt of a replied letter that reaches the UI, in UTF-16 units. */
export const EXCERPT_MAX_LENGTH = 140;

/**
 * Incoming text is untrusted: the UI renders it as text, never as HTML. Control characters go;
 * a reply's excerpt becomes one bounded line; mentions that do not fit the body go.
 */
export function sanitize(message: Message): Message {
  const body = stripControlCharacters(message.body);
  const reactions = sanitizeReactions(message.reactions);
  const versions = message.versions?.map((version) => ({
    ...version,
    body: stripControlCharacters(version.body),
  }));
  const replyTo = message.replyTo && sanitizeReply(message.replyTo);
  // Offsets point into the received body: a body that lost characters cannot keep them.
  const mentions =
    message.mentions && body === message.body ? validMentions(body, message.mentions) : undefined;
  const same =
    body === message.body &&
    reactions === message.reactions &&
    !versions &&
    replyTo === message.replyTo &&
    mentions === message.mentions;
  if (same) return message;
  const clean: Message = { ...message, body, reactions };
  if (replyTo) clean.replyTo = replyTo;
  if (versions) clean.versions = versions;
  if (mentions && mentions.length > 0) clean.mentions = mentions;
  else delete clean.mentions;
  return clean;
}

/** The excerpt on one line, at most `EXCERPT_MAX_LENGTH`; the nick without control characters. */
export function sanitizeReply(reply: ReplyTo): ReplyTo {
  const excerpt = reply.excerpt === undefined ? undefined : oneLine(reply.excerpt);
  const fromNick =
    reply.fromNick === undefined ? undefined : stripControlCharacters(reply.fromNick);
  if (excerpt === reply.excerpt && fromNick === reply.fromNick) return reply;
  const clean: ReplyTo = { ...reply };
  if (excerpt) clean.excerpt = excerpt;
  else delete clean.excerpt;
  if (fromNick) clean.fromNick = fromNick;
  else delete clean.fromNick;
  return clean;
}

function oneLine(text: string): string {
  const line = stripControlCharacters(text).replace(/\s+/g, ' ').trim();
  return line.length > EXCERPT_MAX_LENGTH ? `${line.slice(0, EXCERPT_MAX_LENGTH - 1)}…` : line;
}

/**
 * Mentions inside the body, in order and not overlapping, each naming what its range holds
 * (the nick, with or without its `@`). Anything else is dropped. Unchanged → the same array.
 */
export function validMentions(body: string, mentions: Mention[]): Mention[] {
  let after = 0;
  const kept = mentions.filter((mention) => {
    const { begin, end } = mention;
    const fits = Number.isInteger(begin) && Number.isInteger(end) && begin >= after;
    if (!fits || end <= begin || end > body.length) return false;
    const named = body.slice(begin, end).replace(/^@/, '').toLowerCase();
    if (named !== mention.nick.toLowerCase()) return false;
    after = end;
    return true;
  });
  return kept.length === mentions.length ? mentions : kept;
}

const MAX_REACTIONS = 32;
const MAX_REACTORS = 64;
const MAX_EMOJI_LENGTH = 16;

/** Reactions come from peers: one short emoji each, no duplicates, bounded counts. */
export function sanitizeReactions(reactions: Reaction[]): Reaction[] {
  const seen = new Map<string, Reaction>();
  for (const reaction of reactions) {
    const emoji = reaction.emoji.trim();
    if (!emoji || emoji.length > MAX_EMOJI_LENGTH || /\s/.test(emoji)) continue;
    const existing = seen.get(emoji);
    const fromJids = [...new Set([...(existing?.fromJids ?? []), ...reaction.fromJids])].slice(
      0,
      MAX_REACTORS,
    );
    seen.set(emoji, { emoji, fromJids, mine: Boolean(existing?.mine) || reaction.mine });
    if (seen.size >= MAX_REACTIONS) break;
  }
  const clean = [...seen.values()];
  const unchanged =
    clean.length === reactions.length &&
    clean.every((r, i) => r === reactions[i] || sameReaction(r, reactions[i]));
  return unchanged ? reactions : clean;
}

function sameReaction(a: Reaction, b: Reaction | undefined): boolean {
  return (
    b !== undefined &&
    a.emoji === b.emoji &&
    a.mine === b.mine &&
    a.fromJids.length === b.fromJids.length &&
    a.fromJids.every((j, i) => j === b.fromJids[i])
  );
}
