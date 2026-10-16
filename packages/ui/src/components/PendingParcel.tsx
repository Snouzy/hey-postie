import { Package, X } from 'lucide-react';
import { useLocale, useText } from '../core/CoreProvider';
import type { Upload } from '../core/useUploads';
import { formatBytes } from '../i18n/bytes';
import { Button } from './Button';

// An outgoing bubble, with the parcel card inside.
const BUBBLE =
  'flex max-w-[min(70%,560px)] flex-col gap-1 self-end rounded-bubble rounded-br-sm bg-navy px-3 py-2 text-navy-contrast shadow-card';
const CARD = 'flex min-w-[220px] items-center gap-3 rounded-sm bg-kraft-soft px-3 py-2 text-ink';
// The progress bar: a kraft track, the uniform navy filling it.
const TRACK =
  'h-1 overflow-hidden rounded-[2px] bg-[color-mix(in_srgb,var(--kraft)_35%,transparent)]';
const ERROR =
  "flex flex-wrap items-center gap-2 font-heading text-[13px] text-navy-contrast [font-variation-settings:'SOFT'_100]";
// `leading-[1.3]` again: cn drops the button's line height when a text size is given.
const ACTION = 'bg-paper-raised px-2 py-[2px] text-[13px] leading-[1.3]';

interface PendingParcelProps {
  upload: Upload;
  onRetry: () => void;
  onDismiss: () => void;
}

/** A parcel on its way: name, weight and the progress bar; or Postie's sentence and Retry. */
export function PendingParcel({ upload, onRetry, onDismiss }: PendingParcelProps) {
  const text = useText();
  const locale = useLocale();
  const percent = Math.round(upload.progress * 100);
  const sentence =
    upload.error === 'error.FileTooLarge' && upload.limit !== null
      ? text('parcel.tooLarge').replace('{limit}', formatBytes(locale, upload.limit))
      : upload.error && text(upload.error);

  return (
    <div className={BUBBLE} data-error={upload.error !== null}>
      <div className={CARD}>
        <Package size={24} className="shrink-0 text-kraft-ink" aria-hidden />
        <div className="flex min-w-0 flex-1 flex-col gap-[2px]">
          <span className="truncate text-[14px] font-semibold" title={upload.file.name}>
            {upload.file.name}
          </span>
          <span className="text-[12px] text-ink-muted">
            {formatBytes(locale, upload.file.size)}
          </span>
          {!upload.error && (
            <div
              className={TRACK}
              role="progressbar"
              aria-label={`${text('parcel.sending')} ${upload.file.name}`}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={percent}
            >
              <div
                className="h-full bg-navy transition-[width] duration-(--motion-fast)"
                style={{ width: `${percent}%` }}
              />
            </div>
          )}
        </div>
      </div>
      {sentence && (
        <div className={ERROR}>
          <p className="m-0" role="alert">
            {sentence}
          </p>
          {upload.error !== 'error.FileTooLarge' && (
            <Button variant="danger" className={ACTION} onClick={onRetry}>
              {text('message.retry')}
            </Button>
          )}
          <Button
            variant="ghost"
            className={ACTION}
            onClick={onDismiss}
            aria-label={text('parcel.dismiss')}
          >
            <X size={14} aria-hidden />
          </Button>
        </div>
      )}
    </div>
  );
}
