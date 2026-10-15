import { DomainError } from '../../contracts/errors';
import type { Loaded } from './engine';
import { string } from './mappers';
import type { ChatModel, MessageModel } from './models';

/**
 * XEP-0363 over Converse's `chat.sendFiles` (wiki/development/converse.md §7 and §15): the engine
 * requests the slot, PUTs the file through `XMLHttpRequest` and, once the upload succeeded, sends
 * a second message carrying the URL and destroys the placeholder.
 */

/** Without any sign of life (placeholder, slot, progress) for this long, the upload is given up. */
export const UPLOAD_IDLE_MS = 60_000;
/** AES-GCM appends a 16-byte tag: an encrypted upload is that much larger than the file (§15). */
export const AESGCM_OVERHEAD_BYTES = 16;

export interface UploadService {
  jid: string;
  maxFileSize: number | null;
}

/**
 * The server's upload component and its limit (data form `max-file-size`), or null without one.
 * Several components: the last one, as Converse's `sendFiles` picks it (`result.pop()`).
 */
export async function discoverUploadService(loaded: Loaded): Promise<UploadService | null> {
  const { api, env, state } = loaded;
  const domain = string(state.session?.get('domain'));
  if (!domain) return null;
  const items = await api.disco.features.get(env.Strophe.NS.HTTPUPLOAD ?? '', domain);
  const item = items.at(-1);
  if (!item) return null;
  const form = item.dataforms
    .where({ FORM_TYPE: { value: env.Strophe.NS.HTTPUPLOAD, type: 'hidden' } })
    .pop();
  const field = form?.attributes['max-file-size'];
  const value =
    field && typeof field === 'object' && 'value' in field
      ? Number.parseInt(String((field as { value: unknown }).value), 10)
      : Number.NaN;
  return { jid: item.id, maxFileSize: Number.isNaN(value) ? null : value };
}

/**
 * Resolves with the sent message once the upload went through. Converse reports its failures as
 * ephemeral `type: 'error'` messages, never as rejections, so the outcome is read from the
 * collection: the placeholder (`file: true`) for progress and `upload`, then the message whose text
 * is the uploaded URL (`oob_url`, or the `aesgcm://` body of an encrypted upload). A hook that
 * throws (`beforeFileUpload`) is an unhandled rejection inside Converse that never reaches here:
 * it shows as an upload that does not start, caught by the idle timer.
 */
export function uploadFile(
  chat: ChatModel,
  file: File,
  onProgress: ((fraction: number) => void) | undefined,
  idleMs = UPLOAD_IDLE_MS,
): Promise<MessageModel> {
  return new Promise<MessageModel>((resolve, reject) => {
    let placeholder: MessageModel | null = null;
    let uploadedUrl: string | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const listeners: Array<[string, (model: unknown) => void]> = [
      ['add', (model) => onAdd(model as MessageModel)],
      ['change:progress', (model) => onProgressChange(model as MessageModel)],
      ['change:upload', (model) => onOutcome(model as MessageModel)],
      ['change:is_ephemeral', (model) => onOutcome(model as MessageModel)],
    ];

    function alive(): void {
      clearTimeout(timer);
      timer = setTimeout(() => {
        fail(
          placeholder
            ? new DomainError('ServerUnreachable', 'ServerUnreachable: upload stalled')
            : unknown('upload did not start'),
        );
      }, idleMs);
    }
    function settle(): void {
      clearTimeout(timer);
      for (const [event, handler] of listeners) chat.messages.off(event, handler);
    }
    function fail(error: DomainError): void {
      settle();
      reject(error);
    }
    function onAdd(model: MessageModel): void {
      if (!placeholder) {
        if (model.get('file')) {
          placeholder = model;
          guardSlot(model);
          alive();
        } else if (isErrorNotice(model)) fail(unknown('upload refused'));
        return;
      }
      if (uploadedUrl && !model.get('file') && textOf(model) === uploadedUrl) {
        settle();
        resolve(model);
      }
    }
    /**
     * `change:put` runs the model's own `uploadFile` before any collection listener, so the only
     * place to refuse a plain-http slot before the XHR opens is the method itself.
     */
    function guardSlot(model: MessageModel): void {
      const upload = model.uploadFile?.bind(model);
      if (!upload) return;
      model.uploadFile = () => {
        if (isHttps(model.get('put')) && isHttps(model.get('get'))) {
          alive();
          upload();
          return;
        }
        fail(unknown('upload slot is not https'));
        // Converse's own convention for a failed upload: the placeholder becomes an ephemeral error.
        model.save({ is_ephemeral: true, type: 'error', upload: 'failure' });
      };
    }
    function onProgressChange(model: MessageModel): void {
      if (model !== placeholder) return;
      alive();
      const progress = Number(model.get('progress'));
      if (Number.isFinite(progress) && progress > 0) onProgress?.(Math.min(progress, 1));
    }
    function onOutcome(model: MessageModel): void {
      if (model !== placeholder) return;
      if (model.get('upload') === 'success') {
        alive();
        uploadedUrl = string(model.get('body'));
      } else if (model.get('upload') === 'failure' || isErrorNotice(model)) {
        fail(unknown('upload failed'));
      }
    }

    for (const [event, handler] of listeners) chat.messages.on(event, handler);
    alive();
    chat.sendFiles([file]).catch((cause: unknown) => fail(unknown('upload failed', cause)));
  });
}

function isHttps(url: unknown): boolean {
  return typeof url === 'string' && /^https:\/\/\S+$/i.test(url);
}

function textOf(model: MessageModel): string {
  return string(model.get('plaintext')) || string(model.get('body'));
}

function isErrorNotice(model: MessageModel): boolean {
  return Boolean(model.get('is_ephemeral')) && model.get('type') === 'error';
}

function unknown(what: string, cause?: unknown): DomainError {
  return new DomainError('Unknown', `Unknown: ${what}`, cause);
}
