import type { CoreDependencies } from '../container';
import type { ConversationArchiveService } from '../contracts/services';
import type {
  ArchiveCursor,
  ArchiveItem,
  ArchiveKind,
  ArchivePage,
  Message,
  SearchHit,
} from '../contracts/types';
import { sanitize } from './sanitize';

/** Letters looked at per call; the server hands them over 50 at a time. */
export const ARCHIVE_PAGE_SIZE = 200;
const FETCH_SIZE = 50;

// Web links only: the "links" of a conversation are pages one can open in a browser.
const WEB_LINK = /https?:\/\/[^\s<>"']+/g;
// Punctuation that ends a sentence is not part of the address.
const TRAILING = /[.,;:!?)]+$/;

export function createArchiveService(
  deps: Pick<CoreDependencies, 'chat' | 'hidden'>,
): ConversationArchiveService {
  /** Up to `ARCHIVE_PAGE_SIZE` letters older than the cursor, newest first, shown ones only. */
  async function lookAt(
    chatId: string,
    cursor?: ArchiveCursor,
  ): Promise<{ letters: Message[]; next?: ArchiveCursor }> {
    const hidden = new Set(await deps.hidden.list(deps.chat.selfJid()));
    const letters: Message[] = [];
    let next = cursor;
    while (letters.length < ARCHIVE_PAGE_SIZE) {
      const options = next ? { ...next, limit: FETCH_SIZE } : { limit: FETCH_SIZE };
      const page = await deps.chat.messages(chatId, options);
      const oldest = page[0];
      // An empty page is the start of the archive (a short one may only be the end of what is held).
      if (!oldest) return { letters: shown(letters, hidden) };
      letters.push(...[...page].reverse());
      next = { before: oldest.id };
    }
    return next ? { letters: shown(letters, hidden), next } : { letters: shown(letters, hidden) };
  }

  return {
    async search(chatId, query, cursor) {
      const { letters, next } = await lookAt(chatId, cursor);
      const needle = fold(query.trim()).text;
      const items: SearchHit[] = [];
      if (needle) {
        for (const message of letters) {
          const ranges = matches(message.body, needle);
          const named = message.attachments.some((file) => fold(file.name).text.includes(needle));
          if (ranges.length > 0 || named) items.push({ message, ranges });
        }
      }
      return page(items, next);
    },

    async collect(chatId, kind, cursor) {
      const { letters, next } = await lookAt(chatId, cursor);
      return page(
        letters.flatMap((message) => itemsOf(message, kind)),
        next,
      );
    },
  };
}

function shown(letters: Message[], hidden: Set<string>): Message[] {
  return letters.filter((message) => !message.retracted && !hidden.has(message.id)).map(sanitize);
}

function page<T>(items: T[], next?: ArchiveCursor): ArchivePage<T> {
  return next ? { items, next } : { items };
}

function itemsOf(message: Message, kind: ArchiveKind): ArchiveItem[] {
  if (kind === 'link') {
    return webLinks(message.body).map((url) => {
      const preview = message.linkPreviews?.find((candidate) => candidate.url === url);
      return preview ? { kind, message, url, preview } : { kind, message, url };
    });
  }
  return message.attachments
    .filter((attachment) => (kind === 'media') === isMedia(attachment.mimeType))
    .map((attachment) => ({ kind, message, attachment }));
}

function isMedia(mimeType: string): boolean {
  return mimeType.startsWith('image/') || mimeType.startsWith('video/');
}

/** The distinct web links of a body, in order. */
export function webLinks(body: string): string[] {
  const urls = [...body.matchAll(WEB_LINK)].map((match) => match[0].replace(TRAILING, ''));
  return [...new Set(urls)];
}

/**
 * Lower case without accents, and for each folded character the index in `text` it came from,
 * so that a match found in the folded text is a range of the original one.
 */
function fold(text: string): { text: string; origin: number[] } {
  let folded = '';
  const origin: number[] = [];
  let index = 0;
  for (const character of text) {
    const plain = character.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
    for (let i = 0; i < plain.length; i++) origin.push(index);
    folded += plain;
    index += character.length;
  }
  origin.push(index);
  return { text: folded, origin };
}

/** Where `needle` (already folded) occurs in `body`, as ranges of `body`, never overlapping. */
export function matches(body: string, needle: string): SearchHit['ranges'] {
  const { text, origin } = fold(body);
  const ranges: SearchHit['ranges'] = [];
  let from = text.indexOf(needle);
  while (from !== -1) {
    const last = from + needle.length - 1;
    ranges.push({ start: origin[from] ?? 0, end: nextOrigin(origin, last) });
    from = text.indexOf(needle, from + needle.length);
  }
  return ranges;
}

/** The end of the original character the folded character at `index` came from. */
function nextOrigin(origin: number[], index: number): number {
  const start = origin[index] ?? 0;
  let next = index + 1;
  while ((origin[next] ?? start + 1) === start) next++;
  return origin[next] ?? start + 1;
}
