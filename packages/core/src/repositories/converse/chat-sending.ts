import { DomainError } from '../../contracts/errors';
import type { Message, SendOptions } from '../../contracts/types';
import { mapMessage } from './chat-messages';
import type { ConverseEngine } from './engine';
import { isRoom } from './mappers';
import type { ChatModel, MessageModel } from './models';
import { sendReactions } from './reactions';
import { replyAttributes } from './replies';
import {
  AESGCM_OVERHEAD_BYTES,
  discoverUploadService,
  type UploadService,
  uploadFile,
} from './upload';

/**
 * What leaves a chat: letters, replies, corrections, retractions, reactions and files
 * (wiki/development/converse.md §6-7). The chat repository finds the chat, this sends.
 */
export class ChatSender {
  /** The upload component of the session's server, discovered once per connection. */
  private uploadService: Promise<UploadService | null> | null = null;
  /** One upload at a time per chat: `uploadFile` identifies its placeholder by order of arrival. */
  private readonly uploads = new Map<string, Promise<unknown>>();
  /** The last letter or correction leaving per chat (see `send`). */
  private readonly sending = new Map<string, Promise<unknown>>();

  constructor(private readonly engine: ConverseEngine) {
    engine.on('disconnected', () => {
      this.uploadService = null;
    });
  }

  /**
   * A reply the Converse way: `reply_to_id` and `reply_to` on the chat are read by the next
   * `sendMessage` (`plugins/chat/model.js:246`, `muc.js:1160`), which adds the quoted fallback and
   * seals both when the chat is sealed. They are cleared after it, whatever happened, and sends go
   * one at a time per chat so that no other letter picks them up.
   */
  send(chat: ChatModel, chatId: string, body: string, options: SendOptions): Promise<Message> {
    const original = options.replyTo ? chat.messages.get(options.replyTo) : undefined;
    if (options.replyTo && !original) throw new DomainError('Unknown', 'Unknown: no such message');
    const reply = original ? replyAttributes(chat, original, isRoom(chat)) : null;
    return oneAtATime(this.sending, chatId, async () => {
      if (reply) chat.set(reply);
      try {
        const model = await chat.sendMessage({ body });
        if (!model) throw new DomainError('Unknown', 'Unknown: the message could not be sent');
        return this.map(model, chat);
      } finally {
        if (reply) chat.set({ reply_to_id: undefined, reply_to: undefined });
      }
    });
  }

  /**
   * XEP-0308 the Converse way: the message is marked `correcting`, and the next `sendMessage`
   * replaces it (`model-with-messages.js:365`); a sealed message is corrected sealed.
   */
  correct(chat: ChatModel, chatId: string, messageId: string, body: string): Promise<Message> {
    const model = existing(chat, messageId);
    return oneAtATime(this.sending, chatId, async () => {
      model.save({ correcting: true });
      const corrected = await chat.sendMessage({ body });
      if (!corrected) throw new DomainError('Unknown', 'Unknown: the correction could not be sent');
      return this.map(corrected, chat);
    });
  }

  async retract(chat: ChatModel, messageId: string): Promise<void> {
    await chat.retractOwnMessage(existing(chat, messageId));
  }

  async react(chat: ChatModel, messageId: string, emojis: string[]): Promise<void> {
    const loaded = await this.engine.ready();
    await sendReactions(loaded, chat, existing(chat, messageId), emojis);
  }

  /**
   * Converse checks the limit itself but answers with an ephemeral notice: the check runs here
   * first so that the caller gets `FileTooLarge`; in a sealed chat the encrypted upload carries the
   * AES-GCM tag on top of the file. Converse knows no file size on a message, so the sent
   * attachment takes the size of the file we uploaded.
   */
  async sendFile(
    chat: ChatModel,
    chatId: string,
    file: File,
    onProgress?: (fraction: number) => void,
  ): Promise<Message> {
    const limit = await this.maxFileSize();
    const uploaded = chat.get('omemo_active') ? file.size + AESGCM_OVERHEAD_BYTES : file.size;
    if (limit !== null && uploaded > limit) {
      throw new DomainError('FileTooLarge', `FileTooLarge: limit ${limit} bytes`);
    }
    const sent = await oneAtATime(this.uploads, chatId, () => uploadFile(chat, file, onProgress));
    const message = this.map(sent, chat);
    return {
      ...message,
      attachments: message.attachments.map((attachment) => ({ ...attachment, size: file.size })),
    };
  }

  async maxFileSize(): Promise<number | null> {
    const loaded = await this.engine.ready();
    if (!this.uploadService) {
      this.uploadService = discoverUploadService(loaded).catch((cause: unknown) => {
        this.uploadService = null;
        throw new DomainError('Unknown', 'Unknown: upload service discovery failed', cause);
      });
    }
    return (await this.uploadService)?.maxFileSize ?? null;
  }

  private map(model: MessageModel, chat: ChatModel): Message {
    return mapMessage(this.engine.current, model, chat);
  }
}

/** Work of one chat runs in order: each run starts once the previous one settled. */
function oneAtATime<T>(
  queue: Map<string, Promise<unknown>>,
  chatId: string,
  run: () => Promise<T>,
): Promise<T> {
  const next = (queue.get(chatId) ?? Promise.resolve()).then(run);
  queue.set(
    chatId,
    next.catch(() => undefined),
  );
  return next;
}

function existing(chat: ChatModel, messageId: string): MessageModel {
  const model = chat.messages.get(messageId);
  if (!model) throw new DomainError('Unknown', 'Unknown: no such message');
  return model;
}
