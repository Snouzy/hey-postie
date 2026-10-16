import type { CoreDependencies } from '../container';
import { DomainError } from '../contracts/errors';
import type { EventBus } from '../contracts/events';
import type { AssistantService, AssistantSettings } from '../contracts/services';
import type { Chat } from '../contracts/types';

/** The default loopback port of the MCP listener (spec 2026-10-16-mcp-design, section 5). */
export const ASSISTANT_DEFAULT_PORT = 7413;
/** The keychain entry of the token: not a JID, so it never meets an account's password. */
export const ASSISTANT_TOKEN_KEY = 'hey-postie:assistant-token';

const TOKEN_BYTES = 32;

/**
 * The rules of Claude's access through MCP: off by default, sealed chats left out unless the
 * user includes them, and no sending: Claude prepares drafts the user sends. The token lives in the keychain only.
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

  async function newToken(): Promise<string> {
    const token = randomToken();
    await deps.keychain.set(ASSISTANT_TOKEN_KEY, token);
    // The listener reads the token when the settings are announced: announce them again.
    events.emit('assistant.changed', settings);
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

    draft(draft) {
      if (settings.mode !== 'readAndDraft') {
        throw new DomainError('AssistantNotAllowed', 'AssistantNotAllowed: drafts are off');
      }
      events.emit('assistant.draft', draft);
      events.emit('chat.requested', { chatId: draft.chatId });
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
