import type { Account } from '@hey-postie/core';
import { useEffect, useState } from 'react';
import { useCore, useText } from '../../core/CoreProvider';
import { Button } from '../Button';
import { sectionStyles as styles } from './sectionStyles';

interface AccountSectionProps {
  titleId: string;
  account: Account;
  onSignOut: () => void;
  /** Opens the delete dialog in place of the window (no nested dialogs). */
  onDeleteAccount: () => void;
  /** True when the window comes back from the delete dialog: the focus returns to that button. */
  focusDelete: boolean;
}

/**
 * Who is signed in, whether the password is kept, and the two ways out. The display name and
 * the avatar are read-only until a service can change them.
 */
export function AccountSection({
  titleId,
  account,
  onSignOut,
  onDeleteAccount,
  focusDelete,
}: AccountSectionProps) {
  const core = useCore();
  const text = useText();
  // Unknown until the keychain answers; nothing is said in the meantime.
  const [remembered, setRemembered] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    core.accounts
      .rememberedPassword(account.jid)
      .then((password) => !cancelled && setRemembered(password !== null))
      .catch(() => !cancelled && setRemembered(false));
    return () => {
      cancelled = true;
    };
  }, [core, account.jid]);

  return (
    <div className={styles.section}>
      <h3 id={titleId} className={styles.title}>
        {text('settings.section.account')}
      </h3>
      <section className={styles.group} aria-labelledby={`${titleId}-identity`}>
        <h4 id={`${titleId}-identity`} className={styles.heading}>
          {text('settings.account.identity')}
        </h4>
        <p className={styles.text}>{account.displayName}</p>
        <p className={`${styles.text} ${styles.mono}`}>{account.jid}</p>
      </section>
      <section className={styles.group} aria-labelledby={`${titleId}-password`}>
        <h4 id={`${titleId}-password`} className={styles.heading}>
          {text('settings.account.password')}
        </h4>
        {remembered !== null && (
          <p className={styles.hint}>
            {text(remembered ? 'settings.account.remembered' : 'settings.account.notRemembered')}
          </p>
        )}
      </section>
      <section className={styles.group} aria-labelledby={`${titleId}-leave`}>
        <h4 id={`${titleId}-leave`} className={styles.heading}>
          {text('settings.account.leave')}
        </h4>
        <div className={styles.row}>
          <Button onClick={onSignOut}>{text('main.signOut')}</Button>
          <Button
            variant="danger"
            onClick={onDeleteAccount}
            data-autofocus={focusDelete ? '' : undefined}
          >
            {text('accountMenu.delete')}
          </Button>
        </div>
        <p className={styles.hint}>{text('settings.account.deleteHint')}</p>
      </section>
    </div>
  );
}
