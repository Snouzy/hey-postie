import { MAX_REASON_LENGTH } from '@hey-postie/core';
import { useState } from 'react';
import { useText } from '../core/CoreProvider';
import { errorKey } from '../i18n/errors';
import { Button } from './Button';
import { Dialog } from './Dialog';
import { Field } from './Field';

/**
 * The one confirmation before a letter goes for everyone: mine (deleted for everyone) or someone's
 * in a hall I moderate (removed, with an optional reason). It says plainly that the other side's
 * app decides; Postie's sentence on a refusal; not closable while the service answers.
 */
export function DeleteMessageDialog({
  kind,
  onConfirm,
  onClose,
}: {
  kind: 'deleteForEveryone' | 'moderate';
  onConfirm: (reason: string) => Promise<void>;
  onClose: () => void;
}) {
  const text = useText();
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    setBusy(true);
    setError(null);
    try {
      await onConfirm(reason);
      onClose();
    } catch (caught) {
      setError(text(errorKey(caught)));
      setBusy(false);
    }
  }

  return (
    <Dialog title={text(`message.confirm.${kind}.title`)} onClose={onClose} closable={!busy}>
      <p className="m-0">{text(`message.confirm.${kind}.text`)}</p>
      {kind === 'moderate' && (
        <Field
          label={text('message.confirm.reason')}
          value={reason}
          maxLength={MAX_REASON_LENGTH}
          onChange={(event) => setReason(event.target.value)}
        />
      )}
      {error && (
        <p
          className="m-0 font-heading text-[14px] text-red [font-variation-settings:'SOFT'_100]"
          role="alert"
        >
          {error}
        </p>
      )}
      <div className="flex justify-end gap-3">
        <Button onClick={onClose} disabled={busy}>
          {text('message.confirm.cancel')}
        </Button>
        <Button variant="danger" onClick={() => void confirm()} disabled={busy}>
          {text(`message.confirm.${kind}.button`)}
        </Button>
      </div>
    </Dialog>
  );
}
