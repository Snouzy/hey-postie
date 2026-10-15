export type { CoreDependencies } from './container';
export { createCore } from './container';
export * from './contracts';
export type { FakeDependencies } from './fakes';
export { createFakeDependencies, FakeChat, FakeCrypto, FakeRoom, FakeRoster } from './fakes';
export type { ConverseRepositories, EngineOptions } from './repositories/converse';
export { createConverseRepositories } from './repositories/converse';
export { domainOf, normalizeJid } from './services/jid';
