import { createCore } from '@hey-postie/core';
import { App, pickLocale } from '@hey-postie/ui';
import '@hey-postie/ui/styles';
import { StrictMode, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { createTauriDependencies } from './dependencies';
import { startDesktopIntegrations } from './desktop';
import { isTauri, signalSmokeReady } from './tauri';

const core = createCore(createTauriDependencies());
const locale = pickLocale(navigator.languages);
if (isTauri()) {
  startDesktopIntegrations(core).catch((error: unknown) =>
    console.warn('[desktop] integrations failed to start', error),
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
    <App core={core} locale={locale} />
    <SmokeSignal />
  </StrictMode>,
);

// Vite hot reload re-runs this module: unmount first, or React warns about a second root.
import.meta.hot?.dispose(() => reactRoot.unmount());
