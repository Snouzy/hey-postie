import type { RegistrationForm as ServerForm } from '@hey-postie/core';
import { type FormEvent, useId, useState } from 'react';
import { Button } from '../components/Button';
import { Field } from '../components/Field';
import { useCore, useText } from '../core/CoreProvider';
import type { MessageKey } from '../i18n';
import { errorKey } from '../i18n/errors';
import { Postie } from '../illustrations/Postie';
import styles from './CreateAccount.module.css';
import { RegistrationForm } from './RegistrationForm';

interface CreateAccountProps {
  onBack: () => void;
  onOpenLink: (url: string) => void;
  /** The account exists on the server but could not sign in: SignIn takes over with that JID. */
  onCreatedButNotSignedIn: (jid: string) => void;
}

// A directory, not a list we vouch for: the user picks, we only point the way.
const DIRECTORY_URL = 'https://providers.xmpp.net';

/**
 * Two steps. "Where?": a domain, asked for its registration form. "Who?": that form, rendered by
 * `RegistrationForm`. Success signs the account in, so `App` moves to Main on its own. The
 * typed values live here so that "Back" and forth loses nothing.
 */
export function CreateAccount({ onBack, onOpenLink, onCreatedButNotSignedIn }: CreateAccountProps) {
  const core = useCore();
  const text = useText();
  const helpId = useId();
  const [domain, setDomain] = useState('');
  const [form, setForm] = useState<ServerForm | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState<MessageKey | null>(null);

  async function askServer(event: FormEvent) {
    event.preventDefault();
    if (asking) return;
    setError(null);
    setAsking(true);
    try {
      setForm(await core.accounts.registrationForm(domain));
    } catch (caught) {
      setError(errorKey(caught));
    } finally {
      setAsking(false);
    }
  }

  if (form) {
    return (
      <RegistrationForm
        form={form}
        values={values}
        onChange={(name, value) => setValues((current) => ({ ...current, [name]: value }))}
        onBack={() => setForm(null)}
        onCreatedButNotSignedIn={onCreatedButNotSignedIn}
      />
    );
  }

  const mood = asking ? 'thinking' : error ? 'oops' : 'sealed';

  return (
    <main className={styles.screen}>
      <Postie mood={mood} label={text(`postie.alt.${mood}`)} size={140} />
      <h1 className={styles.title}>{text('createAccount.title')}</h1>
      <form className={styles.form} onSubmit={askServer} aria-busy={asking}>
        <h2 className={styles.step}>{text('createAccount.where')}</h2>
        <p id={helpId} className={styles.help}>
          {text('createAccount.domainHelp')}
        </p>
        <Field
          label={text('createAccount.domain')}
          type="text"
          name="domain"
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          placeholder={text('createAccount.domainPlaceholder')}
          aria-describedby={helpId}
          value={domain}
          onChange={(e) => {
            setError(null);
            setDomain(e.target.value);
          }}
          disabled={asking}
          autoFocus
          required
        />
        <a
          className={styles.link}
          href={DIRECTORY_URL}
          target="_blank"
          rel="noreferrer"
          onClick={(event) => {
            event.preventDefault();
            onOpenLink(DIRECTORY_URL);
          }}
        >
          {text('createAccount.directory')}
        </a>
        <p className={styles.message} role={error ? 'alert' : 'status'}>
          {asking ? text('createAccount.askingServer') : error ? text(error) : ''}
        </p>
        <div className={styles.actions}>
          <Button variant="ghost" onClick={onBack} disabled={asking}>
            {text('createAccount.back')}
          </Button>
          <Button variant="primary" type="submit" disabled={asking || !domain.trim()}>
            {error ? text('createAccount.tryAnother') : text('createAccount.continue')}
          </Button>
        </div>
      </form>
    </main>
  );
}
