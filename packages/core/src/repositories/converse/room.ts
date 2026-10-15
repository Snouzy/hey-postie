import { DomainError } from '../../contracts/errors';
import type { RoomRepository } from '../../contracts/repositories';
import type { Room, RoomInfo, RoomMember, RoomNotify } from '../../contracts/types';
import type { ConverseEngine, Loaded } from './engine';
import { isMention, isRoom } from './mappers';
import type { BookmarkModel, BookmarksCollection, ChatModel, RoomModel } from './models';
import { browseRooms, findRoomService } from './room-browse';
import { attemptJoin, enterNewRoom } from './room-join';
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
   * A new model joins by itself (`plugins/muc/muc.js:134-137`), an existing one is asked to. The
   * password is only ever handed to `join()`: a model attribute would be persisted and published
   * with the bookmark (`enteredNewRoom`), so a new room first joins without it and is asked again
   * with it when the room wants one. A refused room is forgotten, since Converse would rejoin it
   * at the next sign-in; an unreachable one is kept, with its bookmark's autojoin.
   */
  async join(input: { jid: string; nick: string; password?: string }): Promise<Room> {
    const loaded = await this.engine.ready();
    const { api } = loaded;
    const jid = input.jid.toLowerCase();
    const existing = await api.rooms.get(jid);
    if (existing?.isEntered()) return this.room(existing);
    try {
      const chat = existing
        ? await attemptJoin(loaded, existing, this.joinTimeoutMs, () =>
            existing.join(input.nick, input.password),
          )
        : await enterNewRoom(loaded, jid, input, this.joinTimeoutMs);
      return this.room(chat);
    } catch (error) {
      const failure =
        error instanceof DomainError
          ? error
          : new DomainError('Unknown', 'Unknown: the join failed', error);
      if (failure.code !== 'ServerUnreachable') {
        const created = existing ?? (await api.rooms.get(jid));
        await created?.close().catch(() => undefined);
      }
      throw failure;
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
    const { api, state } = await this.engine.ready();
    // The key is per account: without a session there is no account to store it for.
    if (!state.session?.get('bare_jid')) {
      throw new DomainError('Unknown', 'Unknown: not signed in');
    }
    this.notify.set(jid.toLowerCase(), rule);
    const chat = await api.rooms.get(jid.toLowerCase());
    const bookmark = this.bookmarks()?.get(jid.toLowerCase());
    if (chat || bookmark) this.emit(chat ?? undefined, bookmark);
  }

  /**
   * Adding a bookmark with `autojoin` makes Converse join the room (`openBookmarkedRoom`).
   * Removing one through the collection would close it (`leaveRoom`): the model is removed
   * silently and the retraction sent by hand, so that the room stays joined; a refused
   * retraction puts the bookmark back.
   */
  async setBookmarked(jid: string, bookmarked: boolean): Promise<void> {
    const { api } = await this.engine.ready();
    const roomJid = jid.toLowerCase();
    const chat = await api.rooms.get(roomJid);
    if (bookmarked) {
      const bookmarks = await this.bookmarksReady();
      const name = String(chat?.get('name') ?? '');
      const nick = String(chat?.get('nick') ?? '');
      try {
        await api.bookmarks.set({
          jid: roomJid,
          autojoin: true,
          ...(name && { name }),
          ...(nick && { nick }),
        });
      } catch (error) {
        throw new DomainError('Unknown', 'Unknown: the server refused the bookmark', error);
      }
      if (!bookmarks.get(roomJid)) this.emit(chat ?? undefined, undefined);
      return;
    }
    // Nothing to remove without a store (the server has no PEP) or without the bookmark.
    const bookmark = this.bookmarks()?.get(roomJid);
    const bookmarks = this.bookmarks();
    if (!bookmarks || !bookmark) return;
    bookmarks.remove(bookmark, { silent: true });
    try {
      await bookmarks.sendRemoveBookmarkStanza(bookmark);
    } catch (error) {
      bookmarks.add(bookmark, { silent: true });
      throw new DomainError('Unknown', 'Unknown: the server refused the bookmark removal', error);
    }
    chat?.save({ bookmarked: false });
    if (chat) this.emit(chat, undefined);
    else this.emitRoom({ ...this.room(undefined, bookmark), bookmarked: false });
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
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new DomainError('Unknown', 'Unknown: the server has no bookmark storage')),
        BOOKMARKS_TIMEOUT_MS,
      );
    });
    try {
      return (await Promise.race([
        api.waitUntil('bookmarksInitialized'),
        timeout,
      ])) as BookmarksCollection;
    } finally {
      clearTimeout(timer);
    }
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
    // A `setup()` that fails (storage, disco) leaves the room not joined; it must not go unhandled.
    void Promise.resolve(room.initialized).then(
      () => {
        room.session?.on('change:connection_status', () => this.emit(room));
        this.emit(room);
      },
      () => this.emit(room),
    );
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
    this.emitRoom({ ...this.room(room), joined: false, unreadCount: 0, mentionsCount: 0 });
  }

  private emit(chat: RoomModel | undefined, bookmark?: BookmarkModel): void {
    if (chat || bookmark) this.emitRoom(this.room(chat, bookmark));
  }

  private emitRoom(room: Room): void {
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
