import { useEffect, useState } from 'react';
import { useCore, useText } from '../../core/CoreProvider';
import { useCoreEvent } from '../../core/useCoreEvent';
import type { MessageKey } from '../../i18n';
import { errorKey } from '../../i18n/errors';
import { Button } from '../Button';

/**
 * The blocked addresses (`contacts.blocked()`, followed through the `contacts.blocked` event,
 * which carries the whole list) with "Unblock" on each row. One call in flight at a time: the
 * row's button is disabled meanwhile, and a refusal reads as Postie's sentence below the list.
 */
export function BlockedContacts() {
  const core = useCore();
  const text = useText();
  const [jids, setJids] = useState<string[]>([]);
  const [unblocking, setUnblocking] = useState<string | null>(null);
  const [error, setError] = useState<MessageKey | null>(null);

  useEffect(() => {
    let cancelled = false;
    core.contacts
      .blocked()
      .then((list) => !cancelled && setJids(list))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [core]);

  useCoreEvent('contacts.blocked', setJids);

  async function unblock(jid: string) {
    if (unblocking) return;
    setUnblocking(jid);
    setError(null);
    try {
      await core.contacts.unblock(jid);
    } catch (caught) {
      setError(errorKey(caught));
    } finally {
      setUnblocking(null);
    }
  }

  return (
    <>
      <p className="m-0 text-[13px] text-ink-muted">{text('settings.privacy.blockedExplain')}</p>
      {jids.length === 0 ? (
        <p className="m-0 text-ink-muted">{text('settings.privacy.blockedEmpty')}</p>
      ) : (
        <ul
          className="m-0 flex list-none flex-col gap-2 p-0"
          aria-label={text('settings.privacy.blocked')}
        >
          {jids.map((jid) => (
            <li key={jid} className="flex items-center justify-between gap-2">
              <code className="font-mono text-[12px] wrap-anywhere">{jid}</code>
              <Button
                className="shrink-0 px-3 py-[2px] text-[13px]"
                disabled={unblocking === jid}
                aria-label={`${text('settings.privacy.unblock')} ${jid}`}
                onClick={() => void unblock(jid)}
              >
                {text('settings.privacy.unblock')}
              </Button>
            </li>
          ))}
        </ul>
      )}
      {error && (
        <p className="m-0 font-heading text-red [font-variation-settings:'SOFT'_100]" role="alert">
          {text(error)}
        </p>
      )}
    </>
  );
}
