import type { RoomNotify } from '../../contracts/types';

/**
 * The per-room notification rule is a preference, not a secret: it lives in `localStorage` under
 * a key per account and room, and survives leaving the room (a Converse MUC model is destroyed
 * on `close()`, so a model attribute would not).
 */
export class RoomNotifyStore {
  constructor(private readonly accountJid: () => string) {}

  get(roomJid: string): RoomNotify {
    const value = read(this.key(roomJid));
    return value === 'all' || value === 'none' ? value : 'mentions';
  }

  set(roomJid: string, rule: RoomNotify): void {
    try {
      localStorage.setItem(this.key(roomJid), rule);
    } catch {
      // No storage (private window, quota): the rule only lasts for the session.
    }
  }

  private key(roomJid: string): string {
    return `hey-postie:${this.accountJid()}:room-notify:${roomJid}`;
  }
}

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
