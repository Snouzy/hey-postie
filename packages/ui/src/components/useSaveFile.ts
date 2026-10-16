import type { Attachment } from '@hey-postie/core';
import { useState } from 'react';
import { useCore } from '../core/CoreProvider';
import type { MessageKey } from '../i18n';
import { errorKey } from '../i18n/errors';
import type { SaveFile } from './Attachments';

/** "Save" on a parcel: its bytes through `files.fetch` (decrypted when sealed), to `onSaveFile`. */
export function useSaveFile(onSaveFile: SaveFile) {
  const core = useCore();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<MessageKey | null>(null);

  async function save(attachment: Attachment) {
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

  return { save, saving, error };
}
