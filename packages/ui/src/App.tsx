import type { Core } from '@hey-postie/core';
import { useEffect, useRef, useState } from 'react';
import type { SaveFile } from './components/Attachments';
import { DevRibbon } from './components/DevRibbon';
import { CoreProvider } from './core/CoreProvider';
import { downloadBlob } from './core/download';
import { SettingsProvider } from './core/SettingsProvider';
import {
  type LocaleChoice,
  readAssistantSettings,
  readLocaleChoice,
  readShowPreview,
  writeLocaleChoice,
  writeShowPreview,
} from './core/settings';
import { useAccount } from './core/useAccount';
import { useTheme } from './core/useTheme';
import type { Locale } from './i18n';
import { CreateAccount } from './screens/CreateAccount';
import { Main } from './screens/Main';
import { SignIn } from './screens/SignIn';
import { Welcome } from './screens/Welcome';

interface AppProps {
  core: Core;
  /** The system's language; the user may pick another one in Settings. */
  locale: Locale;
  /** Where links in messages go. The desktop app routes them to the system browser. */
  onOpenLink?: (url: string) => void;
  /** Shown in Settings > About; "dev" when the host did not say. */
  version?: string;
  /** Where a saved parcel goes. Default: a browser download; the desktop app opens a file dialog. */
  onSaveFile?: SaveFile;
  /** In a dev window only: which worktree and branch it runs from, shown in a corner ribbon. */
  devLabel?: string;
}

/**
 * Owns the per-viewer choices (theme, language, notification preview): read from `localStorage`
 * on the first render, applied at once, and handed to the Settings dialog through
 * `SettingsProvider`. A language change swaps the dictionary and the whole tree re-renders.
 */
export function App({ core, locale, onOpenLink, version, onSaveFile, devLabel }: AppProps) {
  const [theme, setTheme] = useTheme();
  const [localeChoice, setLocaleChoice] = useState<LocaleChoice>(readLocaleChoice);
  const [showPreview, setShowPreviewState] = useState<boolean>(readShowPreview);
  const effectiveLocale = localeChoice === 'system' ? locale : localeChoice;

  // Screen readers pick their voice from it; a language change must reach the document too.
  useEffect(() => {
    document.documentElement.lang = effectiveLocale;
  }, [effectiveLocale]);

  // Synchronously, on the first render: a letter may arrive before any effect runs.
  const told = useRef(false);
  if (!told.current) {
    told.current = true;
    core.notifications.setShowPreview(showPreview);
    core.assistant.setSettings(readAssistantSettings());
  }

  function setLocale(choice: LocaleChoice) {
    writeLocaleChoice(choice);
    setLocaleChoice(choice);
  }

  function setShowPreview(value: boolean) {
    writeShowPreview(value);
    core.notifications.setShowPreview(value);
    setShowPreviewState(value);
  }

  return (
    <CoreProvider core={core} locale={effectiveLocale}>
      <SettingsProvider
        value={{
          theme,
          setTheme,
          locale: localeChoice,
          setLocale,
          showPreview,
          setShowPreview,
          version: version ?? 'dev',
        }}
      >
        <Screens
          onOpenLink={onOpenLink ?? openInNewWindow}
          onSaveFile={onSaveFile ?? downloadBlob}
        />
        {devLabel && <DevRibbon label={devLabel} />}
      </SettingsProvider>
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
function Screens({
  onOpenLink,
  onSaveFile,
}: {
  onOpenLink: (url: string) => void;
  onSaveFile: SaveFile;
}) {
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
        onSaveFile={onSaveFile}
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
