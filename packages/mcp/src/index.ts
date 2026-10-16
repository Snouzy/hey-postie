import type { Core } from '@hey-postie/core';
import { createMcpHandler } from '@modelcontextprotocol/server';
import { createServer } from './server';

export { INSTRUCTIONS } from './server';

/**
 * The MCP endpoint as a web-standard handler: the desktop app feeds it the requests its local
 * listener let through and sends back the response. The listener (Rust) is the guard: it checks
 * the token, the Host and the Origin before anything reaches here. A browser `Request` cannot even
 * carry `Host` or `Origin` (forbidden headers), so this side could not check them anyway.
 */
export function createMcpFetch(
  core: Core,
  version: string,
): (request: Request) => Promise<Response> {
  const handler = createMcpHandler(() => createServer(core, version));
  return (request) => handler.fetch(request);
}
