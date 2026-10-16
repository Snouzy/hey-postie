import { useEffect, useState } from 'react';
import { useCore, useText } from '../../core/CoreProvider';
import { useCoreEvent } from '../../core/useCoreEvent';
import type { MessageKey } from '../../i18n';
import { errorKey } from '../../i18n/errors';
import { Button } from '../Button';
import styles from './BlockedContacts.module.css';

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
      <p className={styles.hint}>{text('settings.privacy.blockedExplain')}</p>
      {jids.length === 0 ? (
        <p className={styles.empty}>{text('settings.privacy.blockedEmpty')}</p>
      ) : (
        <ul className={styles.list} aria-label={text('settings.privacy.blocked')}>
          {jids.map((jid) => (
            <li key={jid} className={styles.row}>
              <code className={styles.jid}>{jid}</code>
              <Button
                className={styles.action}
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
        <p className={styles.error} role="alert">
          {text(error)}
        </p>
      )}
    </>
  );
}
