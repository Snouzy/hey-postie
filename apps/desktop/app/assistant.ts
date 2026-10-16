import type { AssistantSettings, Core } from '@hey-postie/core';
import { createMcpFetch } from '@hey-postie/mcp';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { focusMainWindow } from './window';

/** A request the Rust listener checked and handed over (`src-tauri/src/mcp/`). */
export interface Forwarded {
  id: number;
  headers: [string, string][];
  body: string;
}

/** What `mcp_reply` takes back (field names as the Rust side reads them). */
export interface Reply {
  status: number;
  content_type: string;
  body: string;
}

/** Runs one forwarded request through the MCP server and shapes the answer for Rust. */
export async function answerForwarded(
  fetchMcp: (request: Request) => Promise<Response>,
  forwarded: Forwarded,
): Promise<Reply> {
  const response = await fetchMcp(
    new Request('http://127.0.0.1/mcp', {
      method: 'POST',
      headers: forwarded.headers,
      body: forwarded.body,
    }),
  );
  return {
    status: response.status,
    content_type: response.headers.get('content-type') ?? 'application/json',
    body: await response.text(),
  };
}

/**
 * Claude's access (spec 2026-10-16-mcp-design): answers the requests the listener forwards, and
 * starts, moves or stops the listener whenever the assistant settings change. Off by default, so
 * nothing listens until the user turns it on. Logs carry the request id, never a body or the token.
 */
export async function serveAssistant(core: Core, version: string): Promise<void> {
  const fetchMcp = createMcpFetch(core, version);
  await listen<Forwarded>('mcp-request', async ({ payload }) => {
    const reply = await answerForwarded(fetchMcp, payload).catch((): Reply => {
      console.warn('[mcp] request failed', payload.id);
      return {
        status: 500,
        content_type: 'application/json',
        body: '{"jsonrpc":"2.0","error":{"code":-32603,"message":"Hey Postie failed to answer."},"id":null}',
      };
    });
    await invoke('mcp_reply', { id: payload.id, reply });
  });
  const follow = (settings: AssistantSettings) =>
    applySettings(core, settings).catch((error: unknown) =>
      console.warn('[mcp] cannot apply the settings', error),
    );
  core.events.on('assistant.changed', follow);
  // A draft lands in the window's composer: bring the window up, even from the tray.
  core.events.on('assistant.draft', () => {
    focusMainWindow().catch((error: unknown) =>
      console.warn('[mcp] cannot show the window', error),
    );
  });
  await follow(core.assistant.getSettings());
}

async function applySettings(core: Core, settings: AssistantSettings): Promise<void> {
  if (settings.mode === 'off') {
    await invoke('mcp_stop');
    return;
  }
  await invoke('mcp_start', { port: settings.port, token: await core.assistant.token() });
}
