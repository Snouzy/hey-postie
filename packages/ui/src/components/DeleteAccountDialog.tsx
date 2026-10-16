import { type FormEvent, useId, useState } from 'react';
import { useCore, useText } from '../core/CoreProvider';
import type { MessageKey } from '../i18n';
import { errorKey } from '../i18n/errors';
import { Button } from './Button';
import { Dialog } from './Dialog';
import { Field } from './Field';

// Postie speaks here, hence the heading font. Room reserved so the card does not jump.
const MESSAGE =
  "m-0 min-h-[1.5em] font-heading text-[15px] text-ink-muted [font-variation-settings:'SOFT'_100] [&[role=alert]]:text-red";

interface DeleteAccountDialogProps {
  jid: string;
  onClose: () => void;
  /** The account is gone from the server and signed out; the caller leaves Main. */
  onDeleted: () => void;
}

/**
 * The one irreversible action: it is explained plainly, and the user types their own address
 * before the button wakes up. Postie does not joke here.
 */
export function DeleteAccountDialog({ jid, onClose, onDeleted }: DeleteAccountDialogProps) {
  const core = useCore();
  const text = useText();
  const explainId = useId();
  const [typed, setTyped] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<MessageKey | null>(null);
  const matches = typed.trim().toLowerCase() === jid;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!matches || deleting) return;
    setDeleting(true);
    setError(null);
    try {
      await core.accounts.deleteAccount();
      onDeleted();
    } catch (caught) {
      setDeleting(false);
      setError(errorKey(caught));
    }
  }

  return (
    <Dialog title={text('deleteAccount.title')} onClose={onClose} closable={!deleting}>
      <form className="flex flex-col gap-3" onSubmit={submit} aria-busy={deleting}>
        <p id={explainId} className="m-0 leading-[1.5]">
          {text('deleteAccount.explain')}
        </p>
        <Field
          label={text('deleteAccount.confirm')}
          type="text"
          name="confirmJid"
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          placeholder={jid}
          aria-describedby={explainId}
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          disabled={deleting}
        />
        <p className={MESSAGE} role={error ? 'alert' : 'status'}>
          {deleting ? text('deleteAccount.deleting') : error ? text(error) : ''}
        </p>
        <div className="flex justify-end gap-2">
          <Button onClick={onClose} disabled={deleting}>
            {text('dialog.cancel')}
          </Button>
          <Button variant="danger" type="submit" disabled={!matches || deleting}>
            {text('deleteAccount.submit')}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
