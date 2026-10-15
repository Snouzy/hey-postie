/**
 * What a contract test needs before Converse opens a real `wss://` socket under Vitest + jsdom
 * (wiki/development/converse.md §11). Same fixes as `contract.test.ts`, which predates this file.
 */

/** Node built-ins, imported by name and typed here: `@types/node` is not a dependency of this package. */
async function nodeModule<T>(name: string): Promise<T> {
  return (await import(/* @vite-ignore */ name)) as T;
}

/**
 * jsdom's WebSocket wraps undici's, which fires `new Event('open')` with the *global* `Event` on a
 * Node `EventTarget`; vitest's jsdom environment made that global jsdom's, so Node rejects it and
 * no socket ever opens. Node's own `Event` (not exported by any module since Node 26, but the base
 * class of a native `MessageEvent`) restores the pairing; jsdom keeps using its internal one.
 */
export async function restoreNodeEvent(): Promise<void> {
  const { port1, port2 } = new MessageChannel();
  const event = await new Promise<object>((resolve) => {
    port1.onmessage = resolve;
    port2.postMessage(null);
  });
  port1.close();
  let prototype = Object.getPrototypeOf(event) as { constructor: typeof Event };
  while (prototype.constructor.name !== 'Event') prototype = Object.getPrototypeOf(prototype);
  globalThis.Event = prototype.constructor;
}

/**
 * Converse fetches `emoji.json` and libomemo its wasm from the page origin (converse.md §1): no
 * page here, so they come from the package's `dist/`. Anything else is refused. The wasm must load:
 * libomemo's emscripten glue, seeing Node, rethrows every unhandled rejection and kills the worker.
 */
export async function serveHeadlessAssets(): Promise<void> {
  const fs = await nodeModule<{
    existsSync(path: string): boolean;
    readFileSync(path: string): BufferSource;
  }>('node:fs');
  const { createRequire } = await nodeModule<{
    createRequire(from: string): { resolve(id: string): string };
  }>('node:module');
  const dist = createRequire(import.meta.url)
    .resolve('@converse/headless/dist/converse-headless.js')
    .replace(/[^/]+$/, '');
  window.fetch = (input: RequestInfo | URL) => {
    const file = dist + (String(input).split('/').pop() ?? '');
    if (!fs.existsSync(file)) return Promise.reject(new Error('no HTTP in the contract test'));
    const type = file.endsWith('.wasm') ? 'application/wasm' : 'application/json';
    return Promise.resolve(
      new Response(fs.readFileSync(file), { headers: { 'content-type': type } }),
    );
  };
}
