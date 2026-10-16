import { describe, expect, it } from 'vitest';
import type { Room } from '../../contracts/types';
import type { ConverseEngine, Loaded } from './engine';
import type { RoomModel } from './models';
import { ConverseRoomRepository } from './room';

/**
 * The repository's reactions to Converse's room events, driven through a stub engine: what the
 * MockConnection cannot produce cheaply (a `setup()` that fails, no session yet).
 */

function model(attrs: Record<string, unknown>) {
  const handlers = new Map<string, Array<(...args: unknown[]) => void>>();
  return {
    get: (key: string) => attrs[key],
    save: () => undefined,
    set: () => undefined,
    on: (event: string, handler: (...args: unknown[]) => void) => {
      handlers.set(event, [...(handlers.get(event) ?? []), handler]);
    },
    off: () => undefined,
  };
}

function collection<M>(models: M[]) {
  return {
    models,
    length: models.length,
    get: () => undefined,
    on: () => undefined,
    off: () => undefined,
  };
}

function roomModel(jid: string, initialized: Promise<unknown>): RoomModel {
  return {
    ...model({ type: 'chatroom', jid, name: 'Hall', nick: 'romeo' }),
    occupants: collection([]),
    messages: collection([]),
    notifications: model({}),
    initialized,
    sendMessage: async () => undefined,
    sendFiles: async () => undefined,
    onReconnection: async () => undefined,
    clearUnreadMsgCounter: () => undefined,
    getDisplayName: () => 'Hall',
    isEntered: () => false,
    isUserMentioned: () => false,
    join: async () => undefined,
    close: async () => undefined,
  };
}

function stubEngine(rooms: RoomModel[], session?: Record<string, unknown>): ConverseEngine {
  const loaded = {
    api: { waitUntil: () => Promise.resolve(null), rooms: { get: async () => null } },
    state: { chatboxes: collection(rooms), ...(session ? { session: model(session) } : {}) },
    roomStatus: { ENTERED: 5 },
  } as unknown as Loaded;
  return {
    onReady: (handler: (loaded: Loaded) => void) => handler(loaded),
    on: () => () => undefined,
    ready: async () => loaded,
  } as unknown as ConverseEngine;
}

describe('ConverseRoomRepository events', () => {
  it('reports a room whose setup failed as not joined, without an unhandled rejection', async () => {
    const failing = roomModel('hall@rooms.example.org', Promise.reject(new Error('storage')));
    failing.initialized?.catch(() => undefined);
    const repository = new ConverseRoomRepository(stubEngine([failing]));
    const emitted: Room[] = [];
    repository.onChange((room) => emitted.push(room));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(emitted).toEqual([
      expect.objectContaining({ jid: 'hall@rooms.example.org', joined: false }),
    ]);
  });

  it('refuses to store a notification rule before an account is signed in', async () => {
    const repository = new ConverseRoomRepository(stubEngine([]));
    await expect(repository.setNotify('hall@rooms.example.org', 'all')).rejects.toMatchObject({
      code: 'Unknown',
    });
  });
});
