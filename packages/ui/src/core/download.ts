/** Long enough for the browser to start the download; the URL is useless after that. */
const REVOKE_AFTER_MS = 60_000;

/** Hands a blob to the browser as a download. The desktop app routes saves through Tauri instead. */
export function downloadBlob(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), REVOKE_AFTER_MS);
}
