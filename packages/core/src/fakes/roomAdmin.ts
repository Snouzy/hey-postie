import { DomainError } from '../contracts/errors';
import type { RoomAdminRepository, RoomInvitationRepository } from '../contracts/repositories';
import type {
  Room,
  RoomAffiliate,
  RoomAffiliation,
  RoomInvitation,
  RoomSettings,
} from '../contracts/types';
import type { FakeRoom } from './room';

type DestroyedHandler = (jid: string, reason?: string) => void;

/**
 * In-memory hall management over a `FakeRoom`: a created hall appears in its list. Tests read what
 * was sent (`invited`, `kicked`, `destroyed`) and set `taken` or `refuse` to make the server say no.
 */
export class FakeRoomAdmin implements RoomAdminRepository {
  readonly settingsByRoom = new Map<string, RoomSettings>();
  readonly affiliates = new Map<string, RoomAffiliate[]>();
  readonly invited: { jid: string; inviteeJid: string }[] = [];
  readonly kicked: { jid: string; nick: string }[] = [];
  readonly destroyed: string[] = [];
  readonly topics = new Map<string, string>();
  /** Addresses the server already knows. */
  readonly taken = new Set<string>();
  /** When set, the next call fails with it (a server refusal). */
  refuse: DomainError | null = null;
  private readonly destroyedHandlers = new Set<DestroyedHandler>();

  constructor(private readonly rooms: FakeRoom) {}

  private check() {
    const refusal = this.refuse;
    this.refuse = null;
    if (refusal) throw refusal;
  }

  async create(input: {
    service: string;
    localpart: string;
    nick: string;
    settings: RoomSettings;
  }): Promise<Room> {
    this.check();
    const jid = `${input.localpart}@${input.service}`;
    if (this.taken.has(jid)) throw new DomainError('RoomExists');
    this.taken.add(jid);
    this.settingsByRoom.set(jid, input.settings);
    this.affiliates.set(jid, [{ jid: 'me@example.org', nick: input.nick, affiliation: 'owner' }]);
    const room: Room = {
      jid,
      name: input.settings.name,
      nick: input.nick,
      joined: true,
      bookmarked: true,
      notify: 'mentions',
      unreadCount: 0,
      mentionsCount: 0,
      visibility: input.settings.visibility,
      affiliation: 'owner',
    };
    this.rooms.change(room);
    return room;
  }

  async settings(jid: string): Promise<RoomSettings> {
    this.check();
    const settings = this.settingsByRoom.get(jid);
    if (!settings) throw new DomainError('RoomNotFound');
    return settings;
  }

  async configure(jid: string, change: Partial<RoomSettings>): Promise<void> {
    this.check();
    this.settingsByRoom.set(jid, { ...(await this.settings(jid)), ...change });
  }

  async setTopic(jid: string, topic: string): Promise<void> {
    this.check();
    this.topics.set(jid, topic);
  }

  async invite(jid: string, inviteeJid: string): Promise<void> {
    this.check();
    this.invited.push({ jid, inviteeJid });
  }

  async setAffiliation(jid: string, userJid: string, affiliation: RoomAffiliation): Promise<void> {
    this.check();
    const others = (this.affiliates.get(jid) ?? []).filter((a) => a.jid !== userJid);
    this.affiliates.set(
      jid,
      affiliation === 'none' ? others : [...others, { jid: userJid, affiliation }],
    );
  }

  async kick(jid: string, nick: string): Promise<void> {
    this.check();
    this.kicked.push({ jid, nick });
  }

  async affiliations(jid: string): Promise<RoomAffiliate[]> {
    this.check();
    return [...(this.affiliates.get(jid) ?? [])];
  }

  async destroy(jid: string, reason?: string): Promise<void> {
    this.check();
    this.destroyed.push(jid);
    for (const handler of this.destroyedHandlers) handler(jid, reason);
  }

  onDestroyed(handler: DestroyedHandler): () => void {
    this.destroyedHandlers.add(handler);
    return () => this.destroyedHandlers.delete(handler);
  }
}

/** Invitations as the server would deliver them: tests call `arrive`, and read `declined`. */
export class FakeRoomInvitations implements RoomInvitationRepository {
  readonly declined: RoomInvitation[] = [];
  private readonly handlers = new Set<(invitation: RoomInvitation) => void>();

  arrive(invitation: RoomInvitation): void {
    for (const handler of this.handlers) handler(invitation);
  }

  onInvitation(handler: (invitation: RoomInvitation) => void): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  async decline(invitation: RoomInvitation): Promise<void> {
    this.declined.push(invitation);
  }
}
