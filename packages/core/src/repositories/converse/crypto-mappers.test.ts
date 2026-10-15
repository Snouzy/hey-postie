import { describe, expect, it } from 'vitest';
import {
  type DeviceModel,
  fromTrust,
  isActive,
  isRoom,
  isUsable,
  mergeVersions,
  toDevice,
  toTrust,
} from './crypto-mappers';

const ME = 'alice@example.org';

function model(attributes: Record<string, unknown>): DeviceModel {
  return {
    get: (key) => attributes[key],
    save: () => undefined,
    on: () => undefined,
    off: () => undefined,
  };
}

describe('trust mapping', () => {
  it('maps Converse 0 / 1 / -1 to untrusted / verified / blocked and never emits trusted', () => {
    expect(toTrust(0)).toBe('untrusted');
    expect(toTrust(1)).toBe('verified');
    expect(toTrust(-1)).toBe('blocked');
    expect(toTrust(undefined)).toBe('untrusted');
    expect(toTrust('1')).toBe('untrusted');
  });

  it('maps back, trusted included, onto the three Converse values', () => {
    expect(fromTrust('verified')).toBe(1);
    expect(fromTrust('blocked')).toBe(-1);
    expect(fromTrust('untrusted')).toBe(0);
    expect(fromTrust('trusted')).toBe(0);
  });
});

describe('toDevice', () => {
  it('reads the id as a number, the fingerprint from the bundle, and flags our own devices', () => {
    const device = toDevice(
      model({ id: '4242', jid: ME, trusted: 1, bundle: { fingerprint: 'ab'.repeat(32) } }),
      ME,
    );
    expect(device).toEqual({
      jid: ME,
      deviceId: 4242,
      fingerprint: 'ab'.repeat(32),
      trust: 'verified',
      isOwn: true,
    });
  });

  it('gives a device without a published bundle an empty fingerprint', () => {
    const device = toDevice(model({ id: 7, jid: 'bob@example.org' }), ME);
    expect(device).toMatchObject({
      deviceId: 7,
      fingerprint: '',
      trust: 'untrusted',
      isOwn: false,
    });
  });
});

describe('usable devices', () => {
  it('is active unless Converse marked it inactive, usable unless blocked too', () => {
    expect(isActive(model({}))).toBe(true);
    expect(isActive(model({ active: false }))).toBe(false);
    expect(isUsable(model({ trusted: 0 }))).toBe(true);
    expect(isUsable(model({ trusted: 1 }))).toBe(true);
    expect(isUsable(model({ trusted: -1 }))).toBe(false);
    expect(isUsable(model({ active: false }))).toBe(false);
  });
});

describe('mergeVersions', () => {
  it('keeps one model per device id, the legacy list first', () => {
    const legacy = [model({ id: '1', version: 'legacy' }), model({ id: 2 })];
    const v2 = [model({ id: 1, version: 'v2' }), model({ id: '3' })];
    const merged = mergeVersions([legacy, v2]);
    expect(merged.map((m) => String(m.get('id')))).toEqual(['1', '2', '3']);
    expect(merged[0]?.get('version')).toBe('legacy');
  });
});

describe('isRoom', () => {
  it('recognizes Converse MUC models by their type', () => {
    const chat = (type: string) => ({ get: () => type }) as unknown as Parameters<typeof isRoom>[0];
    expect(isRoom(chat('chatroom'))).toBe(true);
    expect(isRoom(chat('chatbox'))).toBe(false);
  });
});
