import type { CoreDependencies } from '../container';
import { DomainError } from '../contracts/errors';
import type { FilesService } from '../contracts/services';
import type { Attachment } from '../contracts/types';

/** Images shown inline rather than as a parcel card: by media type, and under this size. */
export const INLINE_IMAGE_MAX_BYTES = 10 * 1024 * 1024;
const INLINE_TYPES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp']);

export function createFilesService(
  deps: Pick<CoreDependencies, 'chat' | 'file' | 'roster'>,
): FilesService {
  return {
    async send(chatId, file, onProgress) {
      const limit = await deps.chat.maxFileSize();
      if (limit !== null && file.size > limit) {
        throw new DomainError('FileTooLarge', `FileTooLarge: limit ${limit} bytes`);
      }
      return deps.chat.sendFile(chatId, file, onProgress);
    },
    maxFileSize: () => deps.chat.maxFileSize(),
    fetch: (attachment) => deps.file.fetch(attachment),
    isInlineImage,
    async autoLoad(message) {
      if (message.direction === 'out') return true;
      const bare = message.fromJid.split('/')[0] ?? '';
      const contacts = await deps.roster.list();
      return contacts.some(
        (c) => c.jid === bare && (c.subscription === 'both' || c.subscription === 'to'),
      );
    },
  };
}

export function isInlineImage(attachment: Attachment): boolean {
  if (!INLINE_TYPES.has(attachment.mimeType)) return false;
  // An unknown size (0) is allowed: the server did not say, the bytes decide at fetch time.
  return attachment.size <= INLINE_IMAGE_MAX_BYTES;
}
