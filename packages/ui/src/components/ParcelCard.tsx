import type { Attachment } from '@hey-postie/core';
import { Lock } from 'lucide-react';
import { useLocale, useText } from '../core/CoreProvider';
import { formatBytes } from '../i18n/bytes';
import type { SaveFile } from './Attachments';
import { Button } from './Button';
import { fileIcon } from './fileIcon';
import { useSaveFile } from './useSaveFile';

const SR_ONLY = 'absolute h-px w-px overflow-hidden [clip:rect(0_0_0_0)]';
// A parcel: kraft paper, a label with the name and the weight.
const CARD =
  'flex min-w-[220px] max-w-full items-center gap-3 rounded-sm border border-[color-mix(in_srgb,var(--kraft)_40%,transparent)] bg-kraft-soft px-3 py-2 text-ink';
const NAME = 'flex items-center gap-1 truncate text-[14px] font-semibold';
// `leading-[1.3]` again: cn drops the button's line height when a text size is given.
const SMALL_ACTION = 'shrink-0 px-3 py-[2px] text-[13px] leading-[1.3]';

interface ParcelCardProps {
  attachment: Attachment;
  onSaveFile: SaveFile;
  /** A picture the user must ask for: "Load image" then shows it inline. */
  onLoad?: (() => void) | undefined;
}

/** A file that is not shown inline: kraft card, icon by type, name, size, "Save". */
export function ParcelCard({ attachment, onSaveFile, onLoad }: ParcelCardProps) {
  const text = useText();
  const locale = useLocale();
  const { save, saving, error } = useSaveFile(onSaveFile);
  const Icon = fileIcon(attachment.mimeType);

  return (
    <div className={CARD}>
      <Icon size={24} className="shrink-0 text-kraft-ink" aria-hidden />
      <div className="flex min-w-0 flex-1 flex-col">
        <span className={NAME} title={attachment.name}>
          {attachment.encryption === 'aesgcm' && (
            <>
              <Lock size={12} className="shrink-0 text-kraft-ink" aria-hidden />
              <span className={SR_ONLY}>{text('parcel.sealed')}</span>
            </>
          )}
          {attachment.name}
        </span>
        <span className="text-[12px] text-ink-muted">
          {attachment.size > 0 ? formatBytes(locale, attachment.size) : attachment.mimeType}
        </span>
        {error && (
          <span
            className="font-heading text-[13px] text-red [font-variation-settings:'SOFT'_100]"
            role="alert"
          >
            {text('parcel.fetchFailed')}
          </span>
        )}
      </div>
      {onLoad && (
        <Button variant="primary" className={SMALL_ACTION} onClick={onLoad}>
          {text('parcel.load')}
        </Button>
      )}
      <Button
        className={SMALL_ACTION}
        onClick={() => void save(attachment)}
        disabled={saving}
        aria-busy={saving}
      >
        {text('parcel.save')}
      </Button>
    </div>
  );
}
