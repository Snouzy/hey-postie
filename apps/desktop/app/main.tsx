import { createCore } from '@hey-postie/core';
import { App, pickLocale } from '@hey-postie/ui';
import '@hey-postie/ui/styles';
import { StrictMode, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { createTauriDependencies } from './dependencies';
import { startDesktopIntegrations } from './desktop';
import { openLinkInBrowser } from './openLink';
import { saveFileToDisk } from './saveFile';
import { isTauri, signalSmokeReady } from './tauri';

const core = createCore(createTauriDependencies());
const locale = pickLocale(navigator.languages);
const desktop = isTauri();
if (desktop) {
  startDesktopIntegrations(core).catch((error: unknown) =>
    console.warn('[desktop] integrations failed to start', error),
  );
}

/** Links go to the system browser; in a plain browser (`pnpm app:dev`) `App` opens a new tab. */
function openLink(url: string) {
  openLinkInBrowser(url).catch((error: unknown) =>
    console.warn('[links] cannot open the link in the browser', error),
  );
}

/** Tells the Rust side that the interface rendered, so that `--smoke` can exit. */
function SmokeSignal() {
  useEffect(() => {
    if (isTauri()) void signalSmokeReady();
  }, []);
  return null;
}

const root = document.getElementById('root');
if (!root) throw new Error('No #root element');

const reactRoot = createRoot(root);
reactRoot.render(
  <StrictMode>
    <App
      core={core}
      locale={locale}
      version={import.meta.env.VITE_APP_VERSION}
      {...(desktop ? { onOpenLink: openLink, onSaveFile: saveFileToDisk } : {})}
    />
    <SmokeSignal />
  </StrictMode>,
);

// Vite hot reload re-runs this module: unmount first, or React warns about a second root.
import.meta.hot?.dispose(() => reactRoot.unmount());
