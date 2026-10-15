/**
 * What a contract test against the local Prosody needs before `@converse/headless` loads: the
 * package's runtime assets served through `fetch`, Node's `Event` class restored under jsdom.
 * Skipped unless `XMPP_TEST_SERVER` is set; `pnpm test:contract` sets it.
 */

export const TIMEOUT = 10_000;

/** Node built-ins, imported by name and typed here: `@types/node` is not a dependency of this package. */
async function nodeModule<T>(name: string): Promise<T> {
  return (await import(/* @vite-ignore */ name)) as T;
}

export async function prepareContractEnvironment(): Promise<{
  SERVER: string | undefined;
  TIMEOUT: number;
}> {
  const SERVER = (globalThis as { process?: { env: Record<string, string | undefined> } }).process
    ?.env.XMPP_TEST_SERVER;
  if (!SERVER) return { SERVER, TIMEOUT };
  window.fetch = await headlessAssetServer();
  globalThis.Event = await nodeEventClass();
  return { SERVER, TIMEOUT };
}

/**
 * Converse fetches `emoji.json` and libomemo its wasm from the page origin (converse.md §1): no
 * page here, so they come from the package's `dist/`. Anything else is refused. The wasm must load:
 * libomemo's emscripten glue, seeing Node, rethrows every unhandled rejection and kills the worker.
 */
export async function headlessAssetServer(): Promise<typeof fetch> {
  const fs = await nodeModule<{
    existsSync(path: string): boolean;
    readFileSync(path: string): BufferSource;
  }>('node:fs');
  const { createRequire } = await nodeModule<{
    createRequire(from: string): { resolve(id: string): string };
  }>('node:module');
  const headlessDist = createRequire(import.meta.url)
    .resolve('@converse/headless/dist/converse-headless.js')
    .replace(/[^/]+$/, '');
  return (input: RequestInfo | URL): Promise<Response> => {
    const file = headlessDist + (String(input).split('/').pop() ?? '');
    if (!fs.existsSync(file)) return Promise.reject(new Error('no HTTP in the contract test'));
    const type = file.endsWith('.wasm') ? 'application/wasm' : 'application/json';
    return Promise.resolve(
      new Response(fs.readFileSync(file), { headers: { 'content-type': type } }),
    );
  };
}

// jsdom's WebSocket wraps undici's, which fires `new Event('open')` with the *global* `Event` on a
// Node `EventTarget`; vitest's jsdom environment made that global jsdom's, so Node rejects it and
// no socket ever opens. Node's own `Event` (not exported by any module since Node 26, but the base
// class of a native `MessageEvent`) restores the pairing; jsdom keeps using its internal one.
async function nodeEventClass(): Promise<typeof Event> {
  const { port1, port2 } = new MessageChannel();
  const event = await new Promise<object>((resolve) => {
    port1.onmessage = resolve;
    port2.postMessage(null);
  });
  port1.close();
  let prototype = Object.getPrototypeOf(event) as { constructor: typeof Event };
  while (prototype.constructor.name !== 'Event') prototype = Object.getPrototypeOf(prototype);
  return prototype.constructor;
}

export async function until<T>(condition: () => T | undefined | false, what: string): Promise<T> {
  const deadline = Date.now() + TIMEOUT;
  while (Date.now() < deadline) {
    const value = condition();
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`timed out waiting for ${what}`);
}
