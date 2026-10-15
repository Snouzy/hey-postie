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
 * The state machine. Before the first successful sign-in, the account state and the user's own
 * clicks ("Sign in", "Back") pick between Welcome and SignIn. Once the account has been online,
 * Main stays mounted through reconnections and drops (it shows a banner); only a sign out, from
 * Main itself, leaves it.
 */
function Screens({ onOpenLink }: { onOpenLink: (url: string) => void }) {
  const account = useAccount();
  const [door, setDoor] = useState<Door>('welcome');
  const [inside, setInside] = useState(false);

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
  if (door === 'signIn') return <SignIn onBack={() => setDoor('welcome')} />;
  return <Welcome onSignIn={() => setDoor('signIn')} />;
}

function openInNewWindow(url: string) {
  window.open(url, '_blank', 'noopener,noreferrer');
}
