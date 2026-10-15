import type {
  ChatRepository,
  CryptoRepository,
  FileRepository,
  RegistrationRepository,
  RoomRepository,
  RosterRepository,
  XmppRepository,
} from '../../contracts/repositories';
import { ConverseChatRepository } from './chat';
import { ConverseCryptoRepository } from './crypto';
import { ConverseEngine, type EngineOptions } from './engine';
import { ConverseFileRepository } from './file';
import { ConverseRegistrationRepository } from './registration';
import { ConverseRoomRepository } from './room';
import { ConverseRosterRepository } from './roster';
import { ConverseXmppRepository } from './xmpp';

export type { EngineOptions, PersistentStore } from './engine';

export interface ConverseRepositories {
  xmpp: XmppRepository;
  roster: RosterRepository;
  chat: ChatRepository;
  room: RoomRepository;
  crypto: CryptoRepository;
  registration: RegistrationRepository;
  file: FileRepository;
}

/** The XMPP repositories over one Converse engine (wiki/development/converse.md). */
export function createConverseRepositories(
  options: EngineOptions & { connectTimeoutMs?: number; joinTimeoutMs?: number } = {},
): ConverseRepositories {
  const engine = new ConverseEngine(options);
  return {
    xmpp: new ConverseXmppRepository(engine, options.connectTimeoutMs),
    roster: new ConverseRosterRepository(engine),
    chat: new ConverseChatRepository(engine),
    room: new ConverseRoomRepository(engine, options.joinTimeoutMs),
    crypto: new ConverseCryptoRepository(engine),
    registration: new ConverseRegistrationRepository(engine, options.connectTimeoutMs),
    file: new ConverseFileRepository(engine),
  };
}
