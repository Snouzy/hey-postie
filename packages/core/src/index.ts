export type { CoreDependencies } from './container';
export { createCore } from './container';
export * from './contracts';
export type { FakeDependencies } from './fakes';
export {
  createFakeDependencies,
  FakeChat,
  FakeCrypto,
  FakeFile,
  FakeRegistration,
  FakeRoom,
  FakeRoster,
} from './fakes';
export type { ConverseRepositories, EngineOptions } from './repositories/converse';
export { createConverseRepositories } from './repositories/converse';
export { MAX_STATUS_LENGTH, MIN_PASSWORD_LENGTH } from './services/accounts';
export { ASSISTANT_DEFAULT_PORT, ASSISTANT_TOKEN_KEY } from './services/assistant';
export { MESSAGE_PAGE_SIZE } from './services/chats';
export { INLINE_IMAGE_MAX_BYTES } from './services/files';
export { domainOf, normalizeJid } from './services/jid';
export { HIDDEN_PREVIEW } from './services/notifications';
export { COMPOSING_REPEAT_MS, PAUSED_AFTER_MS } from './services/typing';
