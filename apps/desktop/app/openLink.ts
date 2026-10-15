import { openUrl } from '@tauri-apps/plugin-opener';

/**
 * The only schemes handed to the system browser. A message can carry any URL, and `javascript:`
 * or `file:` must never leave the webview. The capability `opener:allow-open-url` repeats this
 * list on the Rust side (`src-tauri/capabilities/default.json`).
 */
const OPENABLE_SCHEMES = new Set(['http:', 'https:', 'mailto:']);

export function isOpenableLink(url: string): boolean {
  try {
    return OPENABLE_SCHEMES.has(new URL(url).protocol);
  } catch {
    return false;
  }
}

/** Opens a link from a message in the default browser (or mail client); refuses other schemes. */
export async function openLinkInBrowser(url: string): Promise<void> {
  if (!isOpenableLink(url)) {
    // The URL may hold personal data: log nothing of it.
    console.warn('[links] refused to open a link with an unsupported scheme');
    return;
  }
  await openUrl(url);
}
