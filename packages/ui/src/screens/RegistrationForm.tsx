import {
  DomainError,
  MIN_PASSWORD_LENGTH,
  normalizeJid,
  type RegistrationField,
  type RegistrationForm as ServerForm,
} from '@hey-postie/core';
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
  /** Owned by `CreateAccount`, so that "Back" and forth keeps what was typed. */
  values: Record<string, string>;
  onChange: (name: string, value: string) => void;
  onBack: () => void;
  /** The account exists but signing in failed: the caller sends the user to SignIn. */
  onCreatedButNotSignedIn: (jid: string) => void;
}

/**
 * Step "Who?": the server's own fields, rendered generically, plus our "Repeat password" and the
 * CAPTCHA when the server sets one. Hidden fields are not shown; the repository fills them in.
 */
export function RegistrationForm(props: RegistrationFormProps) {
  const { form, values, onChange } = props;
  const core = useCore();
  const text = useText();
  const account = useAccount();
  const passwordHelpId = useId();
  const messageId = useId();
  const formElement = useRef<HTMLFormElement>(null);
  const [error, setError] = useState<MessageKey | null>(null);
  const [busy, setBusy] = useState(false);
  const creating = busy || account?.state === 'connecting';
  const visible = form.fields.filter((field) => field.type !== 'hidden');
  const captcha = captchaOf(form);

  function set(name: string, value: string) {
    setError(null);
    onChange(name, value);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    const { username = '', password = '', repeat = '' } = values;
    if (password.length < MIN_PASSWORD_LENGTH)
      return refuse('createAccount.passwordTooShort', 'password');
    if (password !== repeat) return refuse('createAccount.passwordMismatch', 'repeat');
    setError(null);
    setBusy(true);
    try {
      const extra = extraOf(values, visible, captcha?.field);
      await core.accounts.register({ domain: form.domain, username, password, extra });
    } catch (caught) {
      setError(errorKey(caught));
      if (!(caught instanceof DomainError)) return;
      if (caught.code === 'AccountConflict') focusUsername();
      if (caught.code === 'AccountCreatedSignInFailed') {
        props.onCreatedButNotSignedIn(normalizeJid(`${username}@${form.domain}`));
      }
    } finally {
      setBusy(false);
    }
  }

  function focusUsername() {
    focusField('username');
  }

  function focusField(name: string) {
    const input = formElement.current?.elements.namedItem(name);
    if (input instanceof HTMLInputElement) input.focus();
  }

  // A rule broken before anything leaves: the sentence, and the focus on the field at fault.
  function refuse(key: MessageKey, field: 'password' | 'repeat') {
    setError(key);
    focusField(field);
  }

  function describedBy(name: string): string | undefined {
    if (name === 'password')
      return passwordInvalid ? `${passwordHelpId} ${messageId}` : passwordHelpId;
    if (name === 'username' && usernameInvalid) return messageId;
    return undefined;
  }

  // Our own words for the two fields every server asks; the server's label for the rest.
  function labelOf(name: string, label: string): string {
    if (name === 'username') return text('createAccount.username');
    if (name === 'password') return text('createAccount.password');
    return label || name;
  }

  const mood = creating ? 'thinking' : error ? 'oops' : 'sealed';
  const passwordInvalid = error === 'createAccount.passwordTooShort';
  const repeatInvalid = error === 'createAccount.passwordMismatch';
  const usernameInvalid = error === 'error.AccountConflict';

  return (
    <main className={layout.screen}>
      <Postie mood={mood} label={text(`postie.alt.${mood}`)} size={140} />
      <h1 className={layout.title}>{text('createAccount.title')}</h1>
      <form ref={formElement} className={layout.form} onSubmit={submit} aria-busy={creating}>
        <h2 className={layout.step}>{text('createAccount.who')}</h2>
        <p className={layout.help}>
          {form.instructions ? `${form.instructions} ` : ''}
          <span className={styles.domain}>@{form.domain}</span>
        </p>
        {visible.map((field, index) => (
          <Field
            key={field.name}
            label={labelOf(field.name, field.label)}
            type={inputTypeOf(field)}
            name={field.name}
            autoComplete={field.name === 'password' ? 'new-password' : 'off'}
            autoCapitalize="none"
            aria-describedby={describedBy(field.name)}
            aria-invalid={
              (field.name === 'password' && passwordInvalid) ||
              (field.name === 'username' && usernameInvalid) ||
              undefined
            }
            value={values[field.name] ?? ''}
            onChange={(e) => set(field.name, e.target.value)}
            disabled={creating}
            autoFocus={index === 0}
            required={field.required || field.name === 'username' || field.name === 'password'}
          />
        ))}
        <p id={passwordHelpId} className={styles.fieldHelp}>
          {text('createAccount.passwordHelp')}
        </p>
        <Field
          label={text('createAccount.repeatPassword')}
          type="password"
          name="repeat"
          autoComplete="new-password"
          value={values.repeat ?? ''}
          onChange={(e) => set('repeat', e.target.value)}
          disabled={creating}
          required
          aria-invalid={repeatInvalid || undefined}
          aria-describedby={repeatInvalid ? messageId : undefined}
        />
        {captcha && (
          <>
            <img
              className={styles.captcha}
              src={captcha.image}
              alt={text('createAccount.captchaAlt')}
            />
            <Field
              label={text('createAccount.captcha')}
              type="text"
              name={captcha.field}
              autoComplete="off"
              value={values[captcha.field] ?? ''}
              onChange={(e) => set(captcha.field, e.target.value)}
              disabled={creating}
              required
            />
          </>
        )}
        <p id={messageId} className={layout.message} role={error ? 'alert' : 'status'}>
          {creating ? text('createAccount.creating') : error ? text(error) : ''}
        </p>
        <div className={layout.actions}>
          <Button variant="ghost" onClick={props.onBack} disabled={creating}>
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

// The server never decides how a password is shown, and only types we know reach the input.
function inputTypeOf(field: RegistrationField): 'password' | 'email' | 'text' {
  if (field.name === 'password') return 'password';
  return field.type === 'email' ? 'email' : 'text';
}

// The core already refuses anything but an image data URL; this is the UI's own belt.
function captchaOf(form: ServerForm): { image: string; field: string } | null {
  const { captchaImageDataUrl: image, captchaField: field } = form;
  return image && field && image.startsWith('data:image/') ? { image, field } : null;
}

// Only what this form asks for: values typed for another server's form never travel.
function extraOf(
  values: Record<string, string>,
  fields: RegistrationField[],
  captchaField: string | undefined,
): Record<string, string> {
  const wanted = fields.map((field) => field.name).concat(captchaField ? [captchaField] : []);
  const extra: Record<string, string> = {};
  for (const name of wanted) {
    const value = values[name];
    if (name !== 'username' && name !== 'password' && value !== undefined) extra[name] = value;
  }
  return extra;
}
