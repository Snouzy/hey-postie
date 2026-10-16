import { createCore, createFakeDependencies } from '@hey-postie/core';
import {
  CLIENT_CAPABILITIES_META_KEY,
  CLIENT_INFO_META_KEY,
  PROTOCOL_VERSION_META_KEY,
} from '@modelcontextprotocol/server';
import { createMcpFetch } from './index';

const VERSION = '2026-07-28';

/** A signed-in core on fakes, and the MCP endpoint over it, called the way a client calls it. */
export async function setup() {
  const deps = createFakeDependencies();
  const core = createCore(deps);
  await core.accounts.signIn({ jid: 'me@example.org', password: 'x', remember: false });
  const fetch = createMcpFetch(core, 'test');

  async function rpc(method: string, params: Record<string, unknown> = {}) {
    const response = await fetch(
      new Request('http://127.0.0.1:7413/mcp', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json, text/event-stream',
          'mcp-protocol-version': VERSION,
          'mcp-method': method,
          ...(typeof params.name === 'string' ? { 'mcp-name': params.name } : {}),
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method,
          params: {
            ...params,
            _meta: {
              [PROTOCOL_VERSION_META_KEY]: VERSION,
              [CLIENT_INFO_META_KEY]: { name: 'test', version: '1' },
              [CLIENT_CAPABILITIES_META_KEY]: {},
            },
          },
        }),
      }),
    );
    const body = await response.json();
    if (!body.result) throw new Error(JSON.stringify(body.error));
    return body.result;
  }

  /** A tool call's text and whether it is an error. */
  async function call(name: string, args: Record<string, unknown> = {}) {
    const result = await rpc('tools/call', { name, arguments: args });
    return { text: result.content[0].text as string, isError: Boolean(result.isError) };
  }

  return { deps, core, rpc, call };
}
