import { type FormEvent, useId, useRef, useState } from 'react';
import { Button } from '../components/Button';
import { Field } from '../components/Field';
import { useCore, useText } from '../core/CoreProvider';
import { useAccount } from '../core/useAccount';
import type { MessageKey } from '../i18n';
import { errorKey } from '../i18n/errors';
import { Postie } from '../illustrations/Postie';

interface SignInProps {
  onBack: () => void;
  /** Coming from account creation: the address is known and Postie explains why we are here. */
  prefill: { jid: string; error: MessageKey } | null;
}

// Just enough to ask the keychain; the service does the real validation on submit.
const LOOKS_LIKE_JID = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

// `box-border`: the padding counts inside the height, or the screen overflows the window by that
// much. `justify-center-safe`: taller than the window (200% zoom), the top stays reachable.
const SCREEN =
  'box-border flex min-h-full flex-col items-center justify-center-safe gap-3 px-6 py-12';
const FORM = 'flex w-[min(360px,100%)] flex-col gap-3 rounded bg-paper-raised p-6 shadow-card';
// Postie speaks here, hence the heading font. Reserve the room so the form does not jump.
const MESSAGE =
  "m-0 min-h-[2.5em] font-heading text-[15px] text-ink-muted [font-variation-settings:'SOFT'_100] [&[role=alert]]:text-red";

export function SignIn({ onBack, prefill }: SignInProps) {
  const core = useCore();
  const text = useText();
  const account = useAccount();
  const messageId = useId();
  const [jid, setJid] = useState(prefill?.jid ?? '');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState<MessageKey | null>(prefill?.error ?? null);
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

  const mood = connecting ? 'thinking' : error ? 'oops' : 'sealed';
  // Which field Postie's sentence is about, so a screen reader hears it from there.
  const jidInvalid = error === 'error.InvalidJid';
  const passwordInvalid = error === 'error.InvalidCredentials';

  return (
    <main className={SCREEN}>
      <Postie mood={mood} label={text(`postie.alt.${mood}`)} size={140} />
      <h1 className="text-[32px] text-navy">{text('signIn.title')}</h1>
      <form className={FORM} onSubmit={submit} aria-busy={connecting}>
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
          aria-invalid={jidInvalid || undefined}
          aria-describedby={jidInvalid ? messageId : undefined}
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
          aria-invalid={passwordInvalid || undefined}
          aria-describedby={passwordInvalid ? messageId : undefined}
        />
        <label className="flex items-center gap-2 text-[14px]">
          <input
            type="checkbox"
            checked={remember}
            onChange={(e) => setRemember(e.target.checked)}
            disabled={connecting}
          />
          {text('signIn.remember')}
        </label>
        <p id={messageId} className={MESSAGE} role={error ? 'alert' : 'status'}>
          {connecting ? text('signIn.connecting') : error ? text(error) : ''}
        </p>
        <div className="flex justify-between gap-3">
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
