import type { CoreDependencies } from '../container';
import { DomainError } from '../contracts/errors';
import type { EventBus } from '../contracts/events';
import type { KeychainRepository } from '../contracts/repositories';
import type { AccountsService } from '../contracts/services';
import type { Account, RegistrationForm } from '../contracts/types';
import { domainOf, normalizeJid } from './jid';

export function createAccountsService(
  deps: Pick<CoreDependencies, 'keychain' | 'transport' | 'xmpp' | 'registration'>,
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

    async registrationForm(domain) {
      const normalized = domainOf(normalizeJid(`a@${domain.trim()}`));
      const websocketUrl = await deps.transport.websocketUrlFor(normalized);
      return checkForm(await deps.registration.form({ domain: normalized, websocketUrl }));
    },

    async register({ domain, username, password, extra }) {
      const jid = normalizeJid(`${username.trim()}@${domain.trim()}`);
      if (password.length < MIN_PASSWORD_LENGTH)
        throw new DomainError('RegistrationRejected', 'RegistrationRejected: password too short');
      const target = domainOf(jid);
      const websocketUrl = await deps.transport.websocketUrlFor(target);
      await deps.registration.submit({
        domain: target,
        websocketUrl,
        values: { ...extra, username: jid.split('@')[0] ?? '', password },
      });
      try {
        return await this.signIn({ jid, password, remember: true });
      } catch (error) {
        // The account exists on the server now: the UI must say so, not show a creation error.
        throw new DomainError('AccountCreatedSignInFailed', undefined, error);
      }
    },

    async deleteAccount() {
      const account = current;
      if (account?.state !== 'online') {
        throw new DomainError('Unknown', 'Unknown: no account signed in');
      }
      await deps.registration.deleteCurrent();
      await deps.xmpp.disconnect();
      current = null;
      events.emit('account.changed', { ...account, state: 'offline' });
      // The server deletion is what matters; local cleanup is best effort, the password first.
      await deps.keychain.delete(account.jid).catch(() => undefined);
      await deps.registration.wipeLocal(account.jid).catch(() => undefined);
    },
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

/** The shortest password the app accepts when creating an account. The UI shows the same rule. */
export const MIN_PASSWORD_LENGTH = 8;

const RESERVED = new Set(['username', 'password']);
const IMAGE_DATA_URL = /^data:image\/(png|jpeg|gif|webp);base64,[A-Za-z0-9+/=]+$/;

/**
 * A server's form is untrusted input: it must ask for a username and a password, a CAPTCHA must
 * come with its image, field names are unique, and the image is a data URL (never a remote
 * resource the webview would fetch before the user decides anything).
 */
function checkForm(form: RegistrationForm): RegistrationForm {
  const names = new Set<string>();
  const fields = form.fields.filter((field) => {
    if (names.has(field.name)) return false;
    names.add(field.name);
    return true;
  });
  if (!names.has('username') || !names.has('password')) {
    throw new DomainError('RegistrationUnsupported', 'RegistrationUnsupported: unusable form');
  }
  const image = form.captchaImageDataUrl;
  const captchaField =
    image && IMAGE_DATA_URL.test(image) && form.captchaField && !RESERVED.has(form.captchaField)
      ? form.captchaField
      : undefined;
  const checked: RegistrationForm = { ...form, fields };
  if (captchaField && image) {
    checked.captchaField = captchaField;
    checked.captchaImageDataUrl = image;
  } else {
    delete checked.captchaField;
    delete checked.captchaImageDataUrl;
  }
  return checked;
}
