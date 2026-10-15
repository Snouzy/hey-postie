import { beforeEach, describe, expect, it } from 'vitest';
import { createCore } from '../container';
import type { Device } from '../contracts/types';
import { createFakeDependencies } from '../fakes';
import { formatFingerprint } from './crypto';

let deps: ReturnType<typeof createFakeDependencies>;
let core: ReturnType<typeof createCore>;

beforeEach(() => {
  deps = createFakeDependencies();
  core = createCore(deps);
});

describe('crypto trust', () => {
  it('verifies, blocks and unblocks a device, emitting devices.changed', async () => {
    deps.fakes.crypto.seed('bob@x.org', { deviceId: 7, fingerprint: 'ab' });
    const seen: Device['trust'][] = [];
    core.events.on('devices.changed', ({ devices }) => seen.push(devices[0]?.trust ?? 'untrusted'));
    await core.crypto.verify(' Bob@X.org ', 7);
    await core.crypto.block('bob@x.org', 7);
    await core.crypto.unblock('bob@x.org', 7);
    expect(seen).toEqual(['verified', 'blocked', 'untrusted']);
  });

  it('refuses an unknown device', async () => {
    await expect(core.crypto.verify('bob@x.org', 99)).rejects.toThrow(/DeviceNotFound/);
  });
});

describe('crypto.setEncryption', () => {
  it('refuses to enable when the other side has no device', async () => {
    await expect(core.crypto.setEncryption('bob@x.org', true)).rejects.toThrow(
      /EncryptionUnavailable/,
    );
    expect(deps.fakes.crypto.encryption.get('bob@x.org')).toBeUndefined();
  });

  it('refuses when every device is blocked, enables otherwise, always allows disabling', async () => {
    deps.fakes.crypto.seed('bob@x.org', { deviceId: 1, fingerprint: 'ab', trust: 'blocked' });
    await expect(core.crypto.setEncryption('bob@x.org', true)).rejects.toThrow(
      /EncryptionUnavailable/,
    );
    deps.fakes.crypto.seed('bob@x.org', { deviceId: 1, fingerprint: 'ab' });
    await core.crypto.setEncryption('bob@x.org', true);
    expect(deps.fakes.crypto.encryption.get('bob@x.org')).toBe(true);
    await core.crypto.setEncryption('bob@x.org', false);
    expect(deps.fakes.crypto.encryption.get('bob@x.org')).toBe(false);
  });
});

describe('own devices', () => {
  it('lists and removes them', async () => {
    deps.fakes.crypto.seed(
      deps.fakes.crypto.ownJid,
      { deviceId: 1, fingerprint: 'a' },
      { deviceId: 2, fingerprint: 'b' },
    );
    expect((await core.crypto.ownDevices()).every((d) => d.isOwn)).toBe(true);
    expect(await core.crypto.ownDeviceId()).toBe(1);
    await core.crypto.removeOwnDevice(2);
    expect((await core.crypto.ownDevices()).map((d) => d.deviceId)).toEqual([1]);
  });
});

describe('formatFingerprint', () => {
  it('groups by eight, upper case, ignoring separators', () => {
    expect(formatFingerprint('ab12cd34 ef56ab12cd')).toBe('AB12CD34 EF56AB12 CD');
    expect(formatFingerprint('')).toBe('');
  });
});
