/** `@` mentions in halls (spec 2026-10-17, Lot B item 10): pure rules, the components draw them. */

/** Someone the composer can name: a hall member, present or away. */
export interface MentionCandidate {
  nick: string;
  present: boolean;
}

/** How many people the list shows at once. */
export const MENTION_LIMIT = 8;

/**
 * An `@` being typed: at the start of a word, then anything but a space or another `@` up to the
 * caret (nothing yet is a query too: every member). Its start is the `@`'s index.
 */
export function mentionAt(body: string, caret: number): { start: number; query: string } | null {
  const match = body.slice(0, caret).match(/(?:^|\s)@([^\s@]*)$/);
  if (!match) return null;
  const query = match[1] ?? '';
  return { start: caret - query.length - 1, query };
}

/**
 * The people whose nick matches, present first, then the nick that is the query, those that start
 * with it, those that contain it (ignoring case), then by name; at most `limit`.
 */
export function rankMentions(
  candidates: MentionCandidate[],
  query: string,
  limit = MENTION_LIMIT,
): MentionCandidate[] {
  const lower = query.toLowerCase();
  const score = (nick: string): number | null => {
    const name = nick.toLowerCase();
    if (name === lower) return 0;
    if (name.startsWith(lower)) return 1;
    return name.includes(lower) ? 2 : null;
  };
  return candidates
    .map((candidate) => ({ candidate, score: score(candidate.nick) }))
    .filter((item): item is { candidate: MentionCandidate; score: number } => item.score !== null)
    .sort(
      (a, b) =>
        Number(b.candidate.present) - Number(a.candidate.present) ||
        a.score - b.score ||
        a.candidate.nick.localeCompare(b.candidate.nick),
    )
    .slice(0, limit)
    .map((item) => item.candidate);
}

/**
 * `@nick ` in place of `start..end` (no second space when one follows): Converse turns an `@`
 * followed by a member's nick into a XEP-0372 reference when the letter leaves.
 */
export function insertMention(
  body: string,
  start: number,
  end: number,
  nick: string,
): { body: string; caret: number } {
  const inserted = body[end] === ' ' ? `@${nick}` : `@${nick} `;
  return {
    body: body.slice(0, start) + inserted + body.slice(end),
    caret: start + inserted.length,
  };
}

/**
 * Tab in a hall: the word before the caret (its `@` optional) completed into the nick it equals,
 * else the first nick that starts with it, ignoring case, as `@nick `. Nothing matches: null.
 */
export function completeNick(
  body: string,
  caret: number,
  nicks: string[],
): { body: string; caret: number } | null {
  const word = body.slice(0, caret).match(/\S+$/)?.[0];
  const typed = word?.replace(/^@/, '').toLowerCase();
  if (!word || !typed) return null;
  const nick =
    nicks.find((candidate) => candidate.toLowerCase() === typed) ??
    nicks.find((candidate) => candidate.toLowerCase().startsWith(typed));
  return nick ? insertMention(body, caret - word.length, caret, nick) : null;
}
