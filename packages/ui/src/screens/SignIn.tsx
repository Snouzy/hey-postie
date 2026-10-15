import { type FormEvent, useRef, useState } from 'react';
import { Button } from '../components/Button';
import { Field } from '../components/Field';
import { useCore, useText } from '../core/CoreProvider';
import { useAccount } from '../core/useAccount';
import type { MessageKey } from '../i18n';
import { errorKey } from '../i18n/errors';
import { Postie } from '../illustrations/Postie';
import styles from './SignIn.module.css';

interface SignInProps {
  onBack: () => void;
}

// Just enough to ask the keychain; the service does the real validation on submit.
const LOOKS_LIKE_JID = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export function SignIn({ onBack }: SignInProps) {
  const core = useCore();
  const text = useText();
  const account = useAccount();
  const [jid, setJid] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState<MessageKey | null>(null);
  const connecting = account?.state === 'connecting';

  // What the keychain gave us, so that it can be taken back when the address changes.
  const prefilled = useRef<string | null>(null);

  async function prefillPassword() {
    const trimmed = jid.trim();
    if (!LOOKS_LIKE_JID.test(trimmed) || password) return;
    const remembered = await core.accounts.rememberedPassword(trimmed);
    if (!remembered) return;
    // Whatever the user typed in the meantime wins.
    setPassword((current) => {
      if (current) return current;
      prefilled.current = remembered;
      return remembered;
    });
  }

  function changeJid(value: string) {
    setJid(value);
    if (prefilled.current !== null && password === prefilled.current) {
      prefilled.current = null;
      setPassword('');
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      await core.accounts.signIn({ jid, password, remember });
    } catch (caught) {
      setError(errorKey(caught));
    }
  }

  const mood = connecting ? 'delivering' : error ? 'oops' : 'sealed';

  return (
    <main className={styles.signIn}>
      <Postie mood={mood} label={text(`postie.alt.${mood}`)} size={140} />
      <h1 className={styles.title}>{text('signIn.title')}</h1>
      <form className={styles.form} onSubmit={submit} aria-busy={connecting}>
        <Field
          label={text('signIn.jid')}
          type="text"
          name="jid"
          autoComplete="username"
          placeholder={text('signIn.jidPlaceholder')}
          value={jid}
          onChange={(e) => changeJid(e.target.value)}
          onBlur={() => void prefillPassword()}
          disabled={connecting}
          required
        />
        <Field
          label={text('signIn.password')}
          type="password"
          name="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={connecting}
          required
        />
        <label className={styles.remember}>
          <input
            type="checkbox"
            checked={remember}
            onChange={(e) => setRemember(e.target.checked)}
            disabled={connecting}
          />
          {text('signIn.remember')}
        </label>
        <p className={styles.message} role={error ? 'alert' : 'status'}>
          {connecting ? text('signIn.connecting') : error ? text(error) : ''}
        </p>
        <div className={styles.actions}>
          <Button variant="ghost" onClick={onBack} disabled={connecting}>
            {text('signIn.back')}
          </Button>
          <Button variant="primary" type="submit" disabled={connecting}>
            {text('signIn.submit')}
          </Button>
        </div>
      </form>
    </main>
  );
}
