import type {
  ChatRepository,
  CryptoRepository,
  RegistrationRepository,
  RosterRepository,
  XmppRepository,
} from '../../contracts/repositories';
import { ConverseChatRepository } from './chat';
import { ConverseCryptoRepository } from './crypto';
import { ConverseEngine, type EngineOptions } from './engine';
import { ConverseRegistrationRepository } from './registration';
import { ConverseRosterRepository } from './roster';
import { ConverseXmppRepository } from './xmpp';

export type { EngineOptions, PersistentStore } from './engine';

export interface ConverseRepositories {
  xmpp: XmppRepository;
  roster: RosterRepository;
  chat: ChatRepository;
  crypto: CryptoRepository;
  registration: RegistrationRepository;
}

/** The XMPP repositories over one Converse engine (wiki/development/converse.md). */
export function createConverseRepositories(
  options: EngineOptions & { connectTimeoutMs?: number } = {},
): ConverseRepositories {
  const engine = new ConverseEngine(options);
  return {
    xmpp: new ConverseXmppRepository(engine, options.connectTimeoutMs),
    roster: new ConverseRosterRepository(engine),
    chat: new ConverseChatRepository(engine),
    crypto: new ConverseCryptoRepository(engine),
    registration: new ConverseRegistrationRepository(engine, options.connectTimeoutMs),
  };
}
