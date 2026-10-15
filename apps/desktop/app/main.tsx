import { createCore } from '@hey-postie/core';
import { App, pickLocale } from '@hey-postie/ui';
import '@hey-postie/ui/styles';
import { StrictMode, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { createTauriDependencies } from './dependencies';
import { isTauri, signalSmokeReady } from './tauri';

const core = createCore(createTauriDependencies());
const locale = pickLocale(navigator.languages);

/** Tells the Rust side that the interface rendered, so that `--smoke` can exit. */
function SmokeSignal() {
  useEffect(() => {
    if (isTauri()) void signalSmokeReady();
  }, []);
  return null;
}

const root = document.getElementById('root');
if (!root) throw new Error('No #root element');

createRoot(root).render(
  <StrictMode>
    <App core={core} locale={locale} />
    <SmokeSignal />
  </StrictMode>,
);
