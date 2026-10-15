import type { Core } from '@hey-postie/core';
import { DomainError, normalizeJid } from '@hey-postie/core';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

/** Emitted by the Rust side (`links.rs`) with the URL of an `xmpp:` link the OS handed us. */
const XMPP_LINK_EVENT = 'xmpp-link';

/**
 * The bare JID of an `xmpp:` link (RFC 5122): `xmpp:user@domain?message;body=…` or
 * `xmpp://me@mine/user@domain`. Only the JID is used; the query is ignored for now.
 * `null` when the link is not an `xmpp:` one or holds no valid JID.
 */
export function jidFromXmppLink(link: string): string | null {
  const match = /^xmpp:(?:\/\/[^/]*\/)?([^?#/]+)/i.exec(link.trim());
  if (!match?.[1]) return null;
  try {
    return normalizeJid(decodeURIComponent(match[1]));
  } catch {
    return null;
  }
}

/**
 * Opens the chat of every `xmpp:` link: the one the app was started with (when the OS gives it
 * before the webview listens), then the ones that arrive while it runs.
 */
export async function openChatsFromXmppLinks(core: Core): Promise<void> {
  await listen<string>(XMPP_LINK_EVENT, (event) => void openChat(core, event.payload));
  const startup = await invoke<string[] | null>('plugin:deep-link|get_current');
  for (const link of startup ?? []) void openChat(core, link);
}

async function openChat(core: Core, link: string): Promise<void> {
  const jid = jidFromXmppLink(link);
  if (!jid) return;
  try {
    const chat = await core.chats.open(jid);
    core.events.emit('chat.requested', { chatId: chat.id });
  } catch (error) {
    // The link holds a JID: log the error code only.
    const code = error instanceof DomainError ? error.code : 'Unknown';
    console.warn('[links] cannot open the chat of an xmpp: link', code);
  }
}
