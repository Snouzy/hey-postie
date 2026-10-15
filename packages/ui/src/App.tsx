import type { Core } from '@hey-postie/core';
import { useState } from 'react';
import { CoreProvider } from './core/CoreProvider';
import { useAccount } from './core/useAccount';
import type { Locale } from './i18n';
import { Main } from './screens/Main';
import { SignIn } from './screens/SignIn';
import { Welcome } from './screens/Welcome';

interface AppProps {
  core: Core;
  locale: Locale;
  /** Where links in messages go. The desktop app routes them to the system browser. */
  onOpenLink?: (url: string) => void;
}

export function App({ core, locale, onOpenLink }: AppProps) {
  return (
    <CoreProvider core={core} locale={locale}>
      <Screens onOpenLink={onOpenLink ?? openInNewWindow} />
    </CoreProvider>
  );
}

type Door = 'welcome' | 'signIn';

/**
 * The state machine: the account state decides between Welcome and Main; the user's own clicks
 * ("Sign in", "Back") decide between Welcome and SignIn while nobody is online.
 */
function Screens({ onOpenLink }: { onOpenLink: (url: string) => void }) {
  const account = useAccount();
  const [door, setDoor] = useState<Door>('welcome');

  if (account?.state === 'online') {
    return (
      <Main account={account} onOpenLink={onOpenLink} onSignedOut={() => setDoor('welcome')} />
    );
  }
  if (door === 'signIn') return <SignIn onBack={() => setDoor('welcome')} />;
  return <Welcome onSignIn={() => setDoor('signIn')} />;
}

function openInNewWindow(url: string) {
  window.open(url, '_blank', 'noopener,noreferrer');
}
