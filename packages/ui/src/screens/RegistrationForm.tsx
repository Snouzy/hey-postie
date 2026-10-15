import { DomainError, type RegistrationForm as ServerForm } from '@hey-postie/core';
import { type FormEvent, useId, useRef, useState } from 'react';
import { Button } from '../components/Button';
import { Field } from '../components/Field';
import { useCore, useText } from '../core/CoreProvider';
import { useAccount } from '../core/useAccount';
import type { MessageKey } from '../i18n';
import { errorKey } from '../i18n/errors';
import { Postie } from '../illustrations/Postie';
import layout from './CreateAccount.module.css';
import styles from './RegistrationForm.module.css';

interface RegistrationFormProps {
  form: ServerForm;
  onBack: () => void;
}

const MIN_PASSWORD = 8;

/**
 * Step "Who?": the server's own fields, rendered generically, plus our "Repeat password" and the
 * CAPTCHA when the server sets one. Hidden fields are not shown; the contract carries no value
 * for them, so they are not sent either.
 */
export function RegistrationForm({ form, onBack }: RegistrationFormProps) {
  const core = useCore();
  const text = useText();
  const account = useAccount();
  const passwordHelpId = useId();
  const formElement = useRef<HTMLFormElement>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [repeat, setRepeat] = useState('');
  const [error, setError] = useState<MessageKey | null>(null);
  const creating = account?.state === 'connecting';
  const visible = form.fields.filter((field) => field.type !== 'hidden');

  function set(name: string, value: string) {
    setValues((current) => ({ ...current, [name]: value }));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const { username = '', password = '', ...extra } = values;
    if (password.length < MIN_PASSWORD) return setError('createAccount.passwordTooShort');
    if (password !== repeat) return setError('createAccount.passwordMismatch');
    setError(null);
    try {
      await core.accounts.register({ domain: form.domain, username, password, extra });
    } catch (caught) {
      setError(errorKey(caught));
      if (caught instanceof DomainError && caught.code === 'AccountConflict') focusUsername();
    }
  }

  function focusUsername() {
    const input = formElement.current?.elements.namedItem('username');
    if (input instanceof HTMLInputElement) input.focus();
  }

  // Our own words for the two fields every server asks; the server's label for the rest.
  function labelOf(name: string, label: string): string {
    if (name === 'username') return text('createAccount.username');
    if (name === 'password') return text('createAccount.password');
    return label || name;
  }

  const mood = creating ? 'delivering' : error ? 'oops' : 'sealed';

  return (
    <main className={layout.screen}>
      <Postie mood={mood} label={text(`postie.alt.${mood}`)} size={140} />
      <h1 className={layout.title}>{text('createAccount.title')}</h1>
      <form ref={formElement} className={layout.form} onSubmit={submit} aria-busy={creating}>
        <h2 className={layout.step}>{text('createAccount.who')}</h2>
        <p className={layout.help}>
          {form.instructions ?? ''}
          {form.instructions ? ' ' : ''}
          <span className={styles.domain}>@{form.domain}</span>
        </p>
        {visible.map((field, index) => {
          const ours = field.name === 'username' || field.name === 'password';
          return (
            <Field
              key={field.name}
              label={labelOf(field.name, field.label)}
              type={field.type}
              name={field.name}
              autoComplete={field.name === 'password' ? 'new-password' : 'off'}
              autoCapitalize="none"
              aria-describedby={field.name === 'password' ? passwordHelpId : undefined}
              value={values[field.name] ?? ''}
              onChange={(e) => set(field.name, e.target.value)}
              disabled={creating}
              autoFocus={index === 0}
              required={field.required || ours}
            />
          );
        })}
        <p id={passwordHelpId} className={styles.fieldHelp}>
          {text('createAccount.passwordHelp')}
        </p>
        <Field
          label={text('createAccount.repeatPassword')}
          type="password"
          name="repeat"
          autoComplete="new-password"
          value={repeat}
          onChange={(e) => setRepeat(e.target.value)}
          disabled={creating}
          required
        />
        {form.captchaImageDataUrl && form.captchaField && (
          <>
            <img
              className={styles.captcha}
              src={form.captchaImageDataUrl}
              alt={text('createAccount.captchaAlt')}
            />
            <Field
              label={text('createAccount.captcha')}
              type="text"
              name={form.captchaField}
              autoComplete="off"
              value={values[form.captchaField] ?? ''}
              onChange={(e) => set(form.captchaField ?? '', e.target.value)}
              disabled={creating}
              required
            />
          </>
        )}
        <p className={layout.message} role={error ? 'alert' : 'status'}>
          {creating ? text('createAccount.creating') : error ? text(error) : ''}
        </p>
        <div className={layout.actions}>
          <Button variant="ghost" onClick={onBack} disabled={creating}>
            {text('createAccount.back')}
          </Button>
          <Button variant="primary" type="submit" disabled={creating}>
            {text('createAccount.submit')}
          </Button>
        </div>
      </form>
    </main>
  );
}
