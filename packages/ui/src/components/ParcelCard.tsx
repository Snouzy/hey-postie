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
import styles from './ParcelCard.module.css';

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
    <div className={styles.card}>
      <Icon size={24} className={styles.icon} aria-hidden />
      <div className={styles.about}>
        <span className={styles.name} title={attachment.name}>
          {attachment.encryption === 'aesgcm' && (
            <>
              <Lock size={12} className={styles.lock} aria-hidden />
              <span className={styles.srOnly}>{text('parcel.sealed')}</span>
            </>
          )}
          {attachment.name}
        </span>
        <span className={styles.size}>
          {attachment.size > 0 ? formatBytes(locale, attachment.size) : attachment.mimeType}
        </span>
        {error && (
          <span className={styles.error} role="alert">
            {text('parcel.fetchFailed')}
          </span>
        )}
      </div>
      {onLoad && (
        <Button variant="primary" className={styles.save} onClick={onLoad}>
          {text('parcel.load')}
        </Button>
      )}
      <Button
        className={styles.save}
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
