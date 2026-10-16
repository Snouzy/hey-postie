import { createCore, createFakeDependencies } from '@hey-postie/core';
import { createMcpFetch } from '@hey-postie/mcp';
import { describe, expect, it } from 'vitest';
import { answerForwarded } from './assistant';

describe('answerForwarded', () => {
  it('runs a forwarded tools/list through the MCP server and returns its answer for Rust', async () => {
    const core = createCore(createFakeDependencies());
    const meta = {
      'io.modelcontextprotocol/protocolVersion': '2026-07-28',
      'io.modelcontextprotocol/clientInfo': { name: 'test', version: '1' },
      'io.modelcontextprotocol/clientCapabilities': {},
    };
    const reply = await answerForwarded(createMcpFetch(core, 'test'), {
      id: 7,
      headers: [
        ['content-type', 'application/json'],
        ['accept', 'application/json, text/event-stream'],
        ['mcp-protocol-version', '2026-07-28'],
        ['mcp-method', 'tools/list'],
      ],
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/list',
        params: { _meta: meta },
      }),
    });
    expect(reply.status).toBe(200);
    expect(reply.content_type).toContain('application/json');
    expect(reply.body).toContain('send_message');
  });
});
