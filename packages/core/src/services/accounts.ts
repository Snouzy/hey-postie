import type { CoreDependencies } from '../container';
import { DomainError } from '../contracts/errors';
import type { EventBus } from '../contracts/events';
import type { KeychainRepository } from '../contracts/repositories';
import type { AccountsService } from '../contracts/services';
import type { Account } from '../contracts/types';
import { domainOf, normalizeJid } from './jid';

export function createAccountsService(
  deps: Pick<CoreDependencies, 'keychain' | 'transport' | 'xmpp'>,
  events: EventBus,
): AccountsService {
  let current: Account | null = null;

  const update = (patch: Partial<Account>): void => {
    if (!current) return;
    current = { ...current, ...patch };
    events.emit('account.changed', current);
  };

  deps.xmpp.onStateChange((state, error) => update(error ? { state, error } : { state }));

  return {
    current: () => current,

    async signIn({ jid, password, remember }) {
      const normalized = normalizeJid(jid);
      current = {
        jid: normalized,
        displayName: normalized.split('@')[0] ?? normalized,
        state: 'connecting',
      };
      events.emit('account.changed', current);
      try {
        if (remember) await rememberQuietly(deps.keychain, normalized, password);
        const websocketUrl = await deps.transport.websocketUrlFor(domainOf(normalized));
        await deps.xmpp.connect({ jid: normalized, password, websocketUrl });
      } catch (error) {
        const domainError =
          error instanceof DomainError ? error : new DomainError('Unknown', undefined, error);
        update({ state: 'error', error: domainError });
        throw domainError;
      }
      update({ state: 'online' });
      return current;
    },

    async signOut() {
      const signedOut = current;
      await deps.xmpp.disconnect();
      current = null;
      if (signedOut) events.emit('account.changed', { ...signedOut, state: 'offline' });
    },

    rememberedPassword: (jid) => deps.keychain.get(normalizeJid(jid)).catch(() => null),
  };
}

// KeychainUnavailable is not a reason to refuse sign-in: the password just is not kept.
async function rememberQuietly(
  keychain: KeychainRepository,
  jid: string,
  password: string,
): Promise<void> {
  try {
    await keychain.set(jid, password);
  } catch (error) {
    if (!(error instanceof DomainError && error.code === 'KeychainUnavailable')) throw error;
  }
}
