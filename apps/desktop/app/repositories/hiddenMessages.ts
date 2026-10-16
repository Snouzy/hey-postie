import type { HiddenMessagesRepository } from '@hey-postie/core';

const KEY = 'hey-postie:hidden-messages';

/**
 * "Delete for me", kept in this window's local storage per account: a list of message ids, no
 * content, nothing secret. Storage that refuses (private window, cleared data) only forgets the list.
 */
export class LocalHiddenMessages implements HiddenMessagesRepository {
  async list(account: string): Promise<string[]> {
    return read()[account] ?? [];
  }

  async add(account: string, messageId: string): Promise<void> {
    const all = read();
    const ids = all[account] ?? [];
    if (ids.includes(messageId)) return;
    all[account] = [...ids, messageId];
    try {
      localStorage.setItem(KEY, JSON.stringify(all));
    } catch {
      // Storage refused: hidden for this session only.
    }
  }
}

function read(): Record<string, string[]> {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const lists: Record<string, string[]> = {};
    for (const [account, ids] of Object.entries(parsed)) {
      if (Array.isArray(ids))
        lists[account] = ids.filter((id): id is string => typeof id === 'string');
    }
    return lists;
  } catch {
    return {};
  }
}
