import { invoke } from '@tauri-apps/api/core';

/** The Rust side refuses larger files too (`save.rs`); checking here avoids sending the bytes. */
export const MAX_SAVE_BYTES = 200 * 1024 * 1024;

/** The suggested file name travels as a header next to the raw bytes, percent-encoded. */
export const FILE_NAME_HEADER = 'x-file-name';

/**
 * "Save" on an attachment: hands the bytes and a suggested name to the Rust command `save_file`,
 * which shows the save panel and writes the file. No path crosses the IPC, so the webview cannot
 * write anywhere the user did not pick. Resolves when the file is written or the panel cancelled.
 */
export async function saveFileToDisk(blob: Blob, name: string): Promise<void> {
  if (blob.size > MAX_SAVE_BYTES) {
    throw new Error(`The file is larger than ${MAX_SAVE_BYTES} bytes`);
  }
  const bytes = new Uint8Array(await blob.arrayBuffer());
  await invoke<boolean>('save_file', bytes, {
    headers: { [FILE_NAME_HEADER]: encodeURIComponent(name) },
  });
}
