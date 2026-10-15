import type { DomainError } from '../contracts/errors';
import type { RoomRepository } from '../contracts/repositories';
import type { Room, RoomInfo, RoomMember, RoomNotify } from '../contracts/types';

type RoomHandler = (room: Room) => void;
type MembersHandler = (jid: string, members: RoomMember[]) => void;

/** In-memory rooms. Tests seed public rooms with `publish()` and members with `setMembers()`. */
export class FakeRoom implements RoomRepository {
  private readonly rooms = new Map<string, Room>();
  private readonly membersByRoom = new Map<string, RoomMember[]>();
  private readonly published = new Map<string, RoomInfo[]>();
  private readonly roomHandlers = new Set<RoomHandler>();
  private readonly membersHandlers = new Set<MembersHandler>();
  /** Rooms that refuse to be joined, by JID, with the error code the server would give. */
  readonly refusals = new Map<string, DomainError>();
  readonly joined: string[] = [];
  readonly left: string[] = [];

  publish(domain: string, rooms: RoomInfo[]): void {
    this.published.set(domain, rooms);
  }

  setMembers(jid: string, members: RoomMember[]): void {
    this.membersByRoom.set(jid, members);
    for (const handler of this.membersHandlers) handler(jid, members);
  }

  /** Simulates a change from the server (topic, counts, a join from elsewhere). */
  change(room: Room): void {
    this.rooms.set(room.jid, room);
    for (const handler of this.roomHandlers) handler(room);
  }

  async list(): Promise<Room[]> {
    return [...this.rooms.values()];
  }

  async join({ jid, nick }: { jid: string; nick: string; password?: string }): Promise<Room> {
    const refusal = this.refusals.get(jid);
    if (refusal) throw refusal;
    this.joined.push(jid);
    const existing = this.rooms.get(jid);
    const room: Room = existing
      ? { ...existing, nick, joined: true }
      : {
          jid,
          name: jid.split('@')[0] ?? jid,
          nick,
          joined: true,
          bookmarked: false,
          notify: 'mentions',
          unreadCount: 0,
          mentionsCount: 0,
        };
    this.change(room);
    return room;
  }

  async leave(jid: string): Promise<void> {
    this.left.push(jid);
    const room = this.rooms.get(jid);
    if (room) this.change({ ...room, joined: false });
  }

  async members(jid: string): Promise<RoomMember[]> {
    return [...(this.membersByRoom.get(jid) ?? [])];
  }

  async setNotify(jid: string, rule: RoomNotify): Promise<void> {
    const room = this.rooms.get(jid);
    if (room) this.change({ ...room, notify: rule });
  }

  async setBookmarked(jid: string, bookmarked: boolean): Promise<void> {
    const room = this.rooms.get(jid);
    if (room) this.change({ ...room, bookmarked });
  }

  async browse(domain: string): Promise<RoomInfo[]> {
    return [...(this.published.get(domain) ?? [])];
  }

  onChange(handler: RoomHandler): () => void {
    this.roomHandlers.add(handler);
    return () => this.roomHandlers.delete(handler);
  }

  onMembersChange(handler: MembersHandler): () => void {
    this.membersHandlers.add(handler);
    return () => this.membersHandlers.delete(handler);
  }
}
