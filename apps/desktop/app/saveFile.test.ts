import { beforeEach, describe, expect, it, vi } from 'vitest';

const { invoke } = vi.hoisted(() => ({
  invoke: vi.fn((..._args: unknown[]) => Promise.resolve(true)),
}));
vi.mock('@tauri-apps/api/core', () => ({ invoke }));

import { FILE_NAME_HEADER, MAX_SAVE_BYTES, saveFileToDisk } from './saveFile';

describe('saveFileToDisk', () => {
  beforeEach(() => invoke.mockClear());

  it('sends the bytes raw and the name percent-encoded in a header', async () => {
    await saveFileToDisk(new Blob(['hello']), 'été ✓.txt');
    expect(invoke).toHaveBeenCalledTimes(1);
    const [command, body, options] = invoke.mock.calls[0] as unknown as [
      string,
      Uint8Array,
      { headers: Record<string, string> },
    ];
    expect(command).toBe('save_file');
    expect(new TextDecoder().decode(body)).toBe('hello');
    expect(options.headers[FILE_NAME_HEADER]).toBe(encodeURIComponent('été ✓.txt'));
  });

  it('refuses a file above the cap without calling Rust', async () => {
    const tooBig = { size: MAX_SAVE_BYTES + 1, arrayBuffer: () => Promise.reject() } as Blob;
    await expect(saveFileToDisk(tooBig, 'big.bin')).rejects.toThrow(/larger/);
    expect(invoke).not.toHaveBeenCalled();
  });
});
