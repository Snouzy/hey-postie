import type { Chat, Core } from '@hey-postie/core';
import { type Answer, refusal } from './answers';

/**
 * Finds the chat Claude means: its JID, or its title when exactly one chat has it. Chats Claude
 * may not see (assistant settings) are never found, so they cannot leak through a name either.
 */
export async function findChat(core: Core, ref: string): Promise<Chat | Answer> {
  const wanted = ref.trim().toLowerCase();
  const visible = (await core.chats.list()).filter((chat) => core.assistant.canRead(chat));
  const byId = visible.find((chat) => chat.id.toLowerCase() === wanted);
  if (byId) return byId;
  const byTitle = visible.filter((chat) => chat.title.toLowerCase() === wanted);
  if (byTitle.length === 1 && byTitle[0]) return byTitle[0];
  if (byTitle.length > 1) {
    const choices = byTitle.map((chat) => `${chat.id} (${chat.title})`).join(', ');
    return refusal(`"${ref}" matches ${byTitle.length} chats: ${choices}. Pass the JID.`);
  }
  return refusal(
    `No chat "${ref}" that Claude may see. Call list_chats for the JIDs, or find_contacts for someone without a chat yet.`,
  );
}

export function isAnswer(value: Chat | Answer): value is Answer {
  return 'content' in value;
}
