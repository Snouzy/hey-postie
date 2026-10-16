import type { CoreDependencies } from '../container';
import { DomainError } from '../contracts/errors';
import type { EventBus } from '../contracts/events';
import type { AssistantService, AssistantSettings } from '../contracts/services';
import type { Chat } from '../contracts/types';

/** The default loopback port of the MCP listener (spec 2026-10-16-mcp-design, section 5). */
export const ASSISTANT_DEFAULT_PORT = 7413;
/** How long a send request waits for the user before it counts as a refusal. */
export const SEND_APPROVAL_TIMEOUT_MS = 2 * 60 * 1000;
/** The keychain entry of the token: not a JID, so it never meets an account's password. */
export const ASSISTANT_TOKEN_KEY = 'hey-postie:assistant-token';

const TOKEN_BYTES = 32;

/**
 * The rules of Claude's access through MCP: off by default, sealed chats left out unless the
 * user includes them, and every send approved by the user. The token lives in the keychain only.
 * Logs carry ids and decisions, never a body or the token.
 */
export function createAssistantService(
  deps: Pick<CoreDependencies, 'keychain'>,
  events: EventBus,
): AssistantService {
  let settings: AssistantSettings = {
    mode: 'off',
    includeSealed: false,
    port: ASSISTANT_DEFAULT_PORT,
  };
  const pending = new Map<string, (approved: boolean) => void>();
  let lastId = 0;

  async function newToken(): Promise<string> {
    const token = randomToken();
    await deps.keychain.set(ASSISTANT_TOKEN_KEY, token);
    return token;
  }

  return {
    getSettings: () => settings,

    setSettings(change) {
      const port = change.port ?? settings.port;
      if (!Number.isInteger(port) || port < 1024 || port > 65535) {
        throw new DomainError('InvalidPort', `InvalidPort: ${port}`);
      }
      settings = { ...settings, ...change, port };
      events.emit('assistant.changed', settings);
      return settings;
    },

    async token() {
      return (await deps.keychain.get(ASSISTANT_TOKEN_KEY)) ?? newToken();
    },

    newToken,

    canRead(chat: Chat) {
      if (settings.mode === 'off') return false;
      return settings.includeSealed || !chat.encrypted;
    },

    requestSend(request) {
      if (settings.mode !== 'readAndSend') {
        return Promise.reject(
          new DomainError('AssistantNotAllowed', 'AssistantNotAllowed: sending is off'),
        );
      }
      lastId += 1;
      const id = `send-${lastId}`;
      return new Promise<boolean>((resolve) => {
        const settle = (approved: boolean) => {
          clearTimeout(timer);
          pending.delete(id);
          events.emit('assistant.sendSettled', { id });
          resolve(approved);
        };
        const timer = setTimeout(() => settle(false), SEND_APPROVAL_TIMEOUT_MS);
        pending.set(id, settle);
        events.emit('assistant.sendRequested', { id, ...request });
      });
    },

    answerSend(id, approved) {
      pending.get(id)?.(approved);
    },
  };
}

/** 32 random bytes, base64url: what a client puts after `Authorization: Bearer`. */
function randomToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(TOKEN_BYTES));
  return btoa(String.fromCharCode(...bytes))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/, '');
}
