import { DomainError } from '../../contracts/errors';
import type { RoomRepository } from '../../contracts/repositories';
import type { Room, RoomInfo, RoomMember, RoomNotify } from '../../contracts/types';
import type { ConverseEngine, Loaded } from './engine';
import { isMention, isRoom } from './mappers';
import type { BookmarkModel, BookmarksCollection, ChatModel, RoomModel } from './models';
import { browseRooms, findRoomService } from './room-browse';
import { JoinWatch } from './room-join';
import { toRoom, toRoomMember } from './room-mappers';
import { RoomNotifyStore } from './room-notify';

type RoomHandler = (room: Room) => void;
type MembersHandler = (jid: string, members: RoomMember[]) => void;

const ROOM_EVENTS = [
  'change:subject',
  'change:num_unread',
  'change:num_unread_general',
  'change:nick',
  'change:name',
  'change:bookmarked',
];
const OCCUPANT_EVENTS = [
  'add',
  'remove',
  'change:presence',
  'change:nick',
  'change:role',
  'change:affiliation',
];
const BOOKMARKS_TIMEOUT_MS = 10_000;

/** Rooms over Converse's MUC models and bookmarks (wiki/development/converse.md, "Rooms (MUC)"). */
export class ConverseRoomRepository implements RoomRepository {
  private readonly roomHandlers = new Set<RoomHandler>();
  private readonly membersHandlers = new Set<MembersHandler>();
  private readonly bound = new WeakSet<RoomModel>();
  private readonly membersPending = new Set<RoomModel>();
  private readonly notify: RoomNotifyStore;
  private loaded: Loaded | null = null;

  constructor(
    private readonly engine: ConverseEngine,
    private readonly joinTimeoutMs = 20_000,
  ) {
    this.notify = new RoomNotifyStore(() =>
      String(this.loaded?.state.session?.get('bare_jid') ?? ''),
    );
    engine.onReady((loaded) => this.bindCollection(loaded));
    // Recreated at every connection (`plugins/bookmarks/plugin.js:138`): bind each time.
    engine.on('bookmarksInitialized', (collection) =>
      this.bindBookmarks(collection as BookmarksCollection),
    );
  }

  async list(): Promise<Room[]> {
    const { api } = await this.engine.ready();
    await api.waitUntil('chatBoxesFetched');
    const rooms = new Map<string, Room>();
    for (const chat of this.roomModels()) rooms.set(String(chat.get('jid')), this.room(chat));
    for (const bookmark of this.bookmarks()?.models ?? []) {
      const jid = String(bookmark.get('jid'));
      if (!rooms.has(jid)) rooms.set(jid, this.room(undefined, bookmark));
    }
    return [...rooms.values()];
  }

  /**
   * A new model joins by itself (`plugins/muc/muc.js:134-137`); an existing one is asked to. The
   * model of a refused join is closed: Converse would otherwise rejoin it at the next sign-in.
   */
  async join(input: { jid: string; nick: string; password?: string }): Promise<Room> {
    const loaded = await this.engine.ready();
    const { api } = loaded;
    const jid = input.jid.toLowerCase();
    const watch = new JoinWatch(loaded, jid);
    let chat: RoomModel | null | undefined;
    try {
      chat = await api.rooms.get(jid);
      if (chat?.isEntered()) return this.room(chat);
      if (chat) await chat.join(input.nick, input.password);
      else {
        const attributes = { nick: input.nick, hidden: true, ...passwordAttribute(input) };
        chat = await api.rooms.get(jid, attributes, true);
      }
      if (!chat) throw new DomainError('Unknown', 'Unknown: the room could not be created');
      await watch.outcome(chat, this.joinTimeoutMs);
      return this.room(chat);
    } catch (error) {
      await chat?.close().catch(() => undefined);
      throw error instanceof DomainError
        ? error
        : new DomainError('Unknown', 'Unknown: the join failed', error);
    } finally {
      watch.release();
    }
  }

  /** `close()` leaves, destroys the model and turns the bookmark's autojoin off (`leaveRoom`). */
  async leave(jid: string): Promise<void> {
    const { api } = await this.engine.ready();
    const chat = await api.rooms.get(jid.toLowerCase());
    if (!chat) return;
    try {
      await chat.close();
    } catch (error) {
      throw new DomainError('Unknown', 'Unknown: the room could not be left', error);
    }
  }

  /** The occupants present in the room; affiliated members who are not in it are skipped. */
  async members(jid: string): Promise<RoomMember[]> {
    const chat = await this.find(jid);
    return membersOf(chat);
  }

  async setNotify(jid: string, rule: RoomNotify): Promise<void> {
    this.notify.set(jid.toLowerCase(), rule);
    const { api } = await this.engine.ready();
    const chat = await api.rooms.get(jid.toLowerCase());
    const bookmark = this.bookmarks()?.get(jid.toLowerCase());
    if (chat || bookmark) this.emit(chat ?? undefined, bookmark);
  }

  /**
   * Adding a bookmark with `autojoin` makes Converse join the room (`openBookmarkedRoom`).
   * Removing one through the collection would close it (`leaveRoom`): the model is removed
   * silently and the retraction sent by hand, so that the room stays joined.
   */
  async setBookmarked(jid: string, bookmarked: boolean): Promise<void> {
    const { api } = await this.engine.ready();
    const bookmarks = await this.bookmarksReady();
    const roomJid = jid.toLowerCase();
    const chat = await api.rooms.get(roomJid);
    try {
      if (bookmarked) {
        const name = String(chat?.get('name') ?? '');
        const nick = String(chat?.get('nick') ?? '');
        await api.bookmarks.set({
          jid: roomJid,
          autojoin: true,
          ...(name && { name }),
          ...(nick && { nick }),
        });
      } else {
        const bookmark = bookmarks.get(roomJid);
        if (!bookmark) return;
        bookmarks.remove(bookmark, { silent: true });
        await bookmarks.sendRemoveBookmarkStanza(bookmark);
        chat?.save({ bookmarked: false });
        this.emit(chat ?? undefined, undefined);
      }
    } catch (error) {
      throw new DomainError('Unknown', 'Unknown: the server refused the bookmark change', error);
    }
  }

  async browse(domain: string): Promise<RoomInfo[]> {
    const { api } = await this.engine.ready();
    return browseRooms(api, domain);
  }

  async roomService(domain: string): Promise<string | null> {
    const { api } = await this.engine.ready();
    return findRoomService(api, domain);
  }

  onChange(handler: RoomHandler): () => void {
    this.roomHandlers.add(handler);
    return () => this.roomHandlers.delete(handler);
  }

  onMembersChange(handler: MembersHandler): () => void {
    this.membersHandlers.add(handler);
    return () => this.membersHandlers.delete(handler);
  }

  private async find(jid: string): Promise<RoomModel> {
    const { api } = await this.engine.ready();
    const chat = await api.rooms.get(jid.toLowerCase());
    if (!chat) throw new DomainError('RoomNotFound', 'RoomNotFound: the room is not joined');
    return chat;
  }

  private bookmarks(): BookmarksCollection | undefined {
    return this.loaded?.state.bookmarks;
  }

  /** Without PEP on the server the collection never exists: fail instead of waiting forever. */
  private async bookmarksReady(): Promise<BookmarksCollection> {
    const { api } = await this.engine.ready();
    const existing = this.bookmarks();
    if (existing) return existing;
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new DomainError('Unknown', 'Unknown: the server has no bookmark storage')),
        BOOKMARKS_TIMEOUT_MS,
      ),
    );
    return (await Promise.race([
      api.waitUntil('bookmarksInitialized'),
      timeout,
    ])) as BookmarksCollection;
  }

  private roomModels(): RoomModel[] {
    const models = this.loaded?.state.chatboxes?.models ?? [];
    return models.filter((chat): chat is RoomModel => isRoom(chat));
  }

  private bindCollection(loaded: Loaded): void {
    this.loaded = loaded;
    const chatboxes = loaded.state.chatboxes;
    if (!chatboxes) return;
    for (const chat of chatboxes.models) this.bindRoom(chat);
    chatboxes.on('add', (chat) => this.bindRoom(chat as ChatModel));
    chatboxes.on('remove', (chat) => {
      if (isRoom(chat as ChatModel)) this.emitLeft(chat as RoomModel);
    });
  }

  /** The session (joined or not) only exists once `setup()` restored it: bind after `initialized`. */
  private bindRoom(chat: ChatModel): void {
    if (!isRoom(chat) || this.bound.has(chat as RoomModel)) return;
    const room = chat as RoomModel;
    this.bound.add(room);
    // `num_unread` (mentions) must agree with `Message.isMention`: Converse's own test is
    // case-sensitive (`plugins/muc/muc.js` `isUserMentioned`), ours is not.
    room.isUserMentioned = (message) => isMention(message, String(room.get('nick')));
    for (const event of ROOM_EVENTS) room.on(event, () => this.emit(room));
    for (const event of OCCUPANT_EVENTS) room.occupants.on(event, () => this.scheduleMembers(room));
    void Promise.resolve(room.initialized).then(() => {
      room.session?.on('change:connection_status', () => this.emit(room));
      this.emit(room);
    });
  }

  private bindBookmarks(bookmarks: BookmarksCollection): void {
    for (const event of ['add', 'change', 'remove']) {
      bookmarks.on(event, (bookmark) => {
        const model = bookmark as BookmarkModel;
        const jid = String(model.get('jid'));
        const chat = this.roomModels().find((room) => room.get('jid') === jid);
        this.emit(chat, event === 'remove' ? undefined : model);
      });
    }
  }

  /** Occupant changes come in bursts (one presence per member on join): one event per tick. */
  private scheduleMembers(room: RoomModel): void {
    if (this.membersPending.has(room)) return;
    this.membersPending.add(room);
    setTimeout(() => {
      this.membersPending.delete(room);
      const members = membersOf(room);
      for (const handler of this.membersHandlers) handler(String(room.get('jid')), members);
    }, 0);
  }

  private emitLeft(room: RoomModel): void {
    const left = { ...this.room(room), joined: false, unreadCount: 0, mentionsCount: 0 };
    for (const handler of this.roomHandlers) handler(left);
  }

  private emit(chat: RoomModel | undefined, bookmark?: BookmarkModel): void {
    if (!chat && !bookmark) return;
    const room = this.room(chat, bookmark);
    for (const handler of this.roomHandlers) handler(room);
  }

  private room(chat: RoomModel | undefined, bookmark?: BookmarkModel): Room {
    const jid = String(chat?.get('jid') ?? bookmark?.get('jid') ?? '');
    const enteredStatus = this.loaded?.roomStatus.ENTERED ?? -1;
    return toRoom(chat, bookmark ?? this.bookmarks()?.get(jid), {
      enteredStatus,
      notify: this.notify.get(jid),
    });
  }
}

function membersOf(chat: RoomModel): RoomMember[] {
  return chat.occupants.models
    .filter((occupant) => occupant.get('presence') !== 'offline')
    .map(toRoomMember);
}

function passwordAttribute(input: { password?: string }): { password?: string } {
  return input.password ? { password: input.password } : {};
}
