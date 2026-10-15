import type { CoreDependencies } from '../container';
import { DomainError } from '../contracts/errors';
import type { EventBus } from '../contracts/events';
import type { CryptoService } from '../contracts/services';
import { normalizeJid } from './jid';

export function createCryptoService(
  deps: Pick<CoreDependencies, 'crypto' | 'chat'>,
  events: EventBus,
): CryptoService {
  deps.crypto.onDevicesChange((jid, devices) => events.emit('devices.changed', { jid, devices }));
  const bare = (jid: string) => normalizeJid(jid).split('/')[0] ?? '';

  return {
    devices: (jid) => deps.crypto.devices(bare(jid)),
    ownDevices: () => deps.crypto.ownDevices(),
    ownDeviceId: () => deps.crypto.ownDeviceId(),
    verify: (jid, deviceId) => deps.crypto.setTrust(bare(jid), deviceId, 'verified'),
    block: (jid, deviceId) => deps.crypto.setTrust(bare(jid), deviceId, 'blocked'),
    unblock: (jid, deviceId) => deps.crypto.setTrust(bare(jid), deviceId, 'untrusted'),
    removeOwnDevice: (deviceId) => deps.crypto.removeOwnDevice(deviceId),
    available: (chatId) => deps.crypto.available(chatId),
    async setEncryption(chatId, enabled) {
      if (enabled && !(await deps.crypto.available(chatId))) {
        throw new DomainError('EncryptionUnavailable');
      }
      await deps.crypto.setEncryption(chatId, enabled);
      // The UI follows chat.updated, in tests and in production alike.
      const chat = (await deps.chat.list()).find((c) => c.id === chatId);
      if (chat) events.emit('chat.updated', { ...chat, encrypted: enabled });
    },
    formatFingerprint,
  };
}

/**
 * `ab12…` → `AB12CD34 EF56…`: eight characters per group, upper case, as other clients show it.
 * Separators are dropped; anything else is not a fingerprint and is shown untouched, so a
 * malformed key never looks like a shorter valid one.
 */
export function formatFingerprint(fingerprint: string): string {
  const clean = fingerprint.replace(/[\s:-]/g, '');
  if (!/^[0-9a-f]*$/i.test(clean)) return fingerprint;
  return (
    clean
      .toUpperCase()
      .match(/.{1,8}/g)
      ?.join(' ') ?? ''
  );
}
