import { emit } from '@tauri-apps/api/event';

/** True inside the Tauri webview, false in a plain browser (Vite dev server, tests). */
export function isTauri(): boolean {
  return '__TAURI_INTERNALS__' in window;
}

export function signalSmokeReady(): Promise<void> {
  return emit('smoke-ready');
}
