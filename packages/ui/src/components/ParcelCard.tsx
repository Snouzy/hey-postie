import type { Attachment } from '@hey-postie/core';
import {
  File,
  FileArchive,
  FileText,
  Film,
  Image,
  Lock,
  type LucideIcon,
  Music,
} from 'lucide-react';
import { useState } from 'react';
import { useCore, useLocale, useText } from '../core/CoreProvider';
import type { MessageKey } from '../i18n';
import { formatBytes } from '../i18n/bytes';
import { errorKey } from '../i18n/errors';
import type { SaveFile } from './Attachments';
import { Button } from './Button';

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
  const core = useCore();
  const text = useText();
  const locale = useLocale();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<MessageKey | null>(null);
  const Icon = iconFor(attachment.mimeType);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      onSaveFile(await core.files.fetch(attachment), attachment.name);
    } catch (caught) {
      setError(errorKey(caught));
    } finally {
      setSaving(false);
    }
  }

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
        onClick={() => void save()}
        disabled={saving}
        aria-busy={saving}
      >
        {text('parcel.save')}
      </Button>
    </div>
  );
}

function iconFor(mimeType: string): LucideIcon {
  if (mimeType.startsWith('image/')) return Image;
  if (mimeType.startsWith('audio/')) return Music;
  if (mimeType.startsWith('video/')) return Film;
  if (mimeType === 'application/pdf' || mimeType.startsWith('text/')) return FileText;
  if (/zip|compressed|tar|7z/.test(mimeType)) return FileArchive;
  return File;
}
