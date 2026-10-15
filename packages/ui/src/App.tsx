import type { Core } from '@hey-postie/core';
import { useState } from 'react';
import { CoreProvider } from './core/CoreProvider';
import { useAccount } from './core/useAccount';
import type { Locale } from './i18n';
import { CreateAccount } from './screens/CreateAccount';
import { Main } from './screens/Main';
import { SignIn } from './screens/SignIn';
import { Welcome } from './screens/Welcome';

interface AppProps {
  core: Core;
  locale: Locale;
  /** Where links in messages go. The desktop app routes them to the system browser. */
  onOpenLink?: (url: string) => void;
  /**
   * "Save" on an attachment. The desktop app shows the OS save panel and writes the file; without
   * it the interface falls back to a browser download.
   */
  onSaveFile?: (blob: Blob, name: string) => Promise<void>;
}

export function App({ core, locale, onOpenLink }: AppProps) {
  return (
    <CoreProvider core={core} locale={locale}>
      <Screens onOpenLink={onOpenLink ?? openInNewWindow} />
    </CoreProvider>
  );
}

type Door = 'welcome' | 'signIn' | 'createAccount';

/**
 * The state machine. Before the first successful sign-in, the account state and the user's own
 * clicks ("Sign in", "Create an account", "Back") pick between Welcome, SignIn and CreateAccount
 * (a created account is signed in right away, so it enters Main the same way). Once the account has been online,
 * Main stays mounted through reconnections and drops (it shows a banner); only a sign out, from
 * Main itself, leaves it.
 */
function Screens({ onOpenLink }: { onOpenLink: (url: string) => void }) {
  const account = useAccount();
  const [door, setDoor] = useState<Door>('welcome');
  const [inside, setInside] = useState(false);
  // An account created but not signed in: SignIn opens with its JID and says so.
  const [createdJid, setCreatedJid] = useState<string | null>(null);

  // Derived during render rather than in an effect, so Main appears on the same frame.
  if (account?.state === 'online' && !inside) setInside(true);

  if (inside && account) {
    return (
      <Main
        account={account}
        onOpenLink={onOpenLink}
        onLeave={(next) => {
          setInside(false);
          setDoor(next);
        }}
      />
    );
  }
  if (door === 'signIn') {
    return (
      <SignIn
        onBack={() => setDoor('welcome')}
        prefill={createdJid ? { jid: createdJid, error: 'error.AccountCreatedSignInFailed' } : null}
      />
    );
  }
  if (door === 'createAccount') {
    return (
      <CreateAccount
        onBack={() => setDoor('welcome')}
        onOpenLink={onOpenLink}
        onCreatedButNotSignedIn={(jid) => {
          setCreatedJid(jid);
          setDoor('signIn');
        }}
      />
    );
  }
  return (
    <Welcome
      onSignIn={() => {
        setCreatedJid(null);
        setDoor('signIn');
      }}
      onCreateAccount={() => setDoor('createAccount')}
    />
  );
}

function openInNewWindow(url: string) {
  window.open(url, '_blank', 'noopener,noreferrer');
}
