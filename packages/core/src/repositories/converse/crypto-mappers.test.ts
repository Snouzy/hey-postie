import { describe, expect, it } from 'vitest';
import {
  type DeviceModel,
  fromTrust,
  groupById,
  groupTrust,
  isActive,
  isGroupActive,
  isGroupUsable,
  isRoom,
  toDevice,
  toTrust,
} from './crypto-mappers';

const ME = 'alice@example.org';
const BOB = 'bob@example.org';

function model(attributes: Record<string, unknown>): DeviceModel {
  return {
    get: (key) => attributes[key],
    save: () => undefined,
    set: () => undefined,
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

describe('groupById', () => {
  it('groups the models of both version lists by device id, in list order', () => {
    const legacy = [model({ id: '1', version: 'legacy' }), model({ id: 2 })];
    const v2 = [model({ id: 1, version: 'v2' }), model({ id: '3' })];
    const groups = groupById(BOB, [legacy, v2]);
    expect(groups.map((g) => [g.id, g.models.length])).toEqual([
      ['1', 2],
      ['2', 1],
      ['3', 1],
    ]);
    expect(groups[0]?.models.map((m) => m.get('version'))).toEqual(['legacy', 'v2']);
    expect(groups.every((g) => g.jid === BOB)).toBe(true);
  });
});

describe('a device across versions', () => {
  const group = (...attributes: Array<Record<string, unknown>>) =>
    groupById(BOB, [attributes.map(model)])[0] ?? { id: '', jid: BOB, models: [] };

  it('takes the most restrictive trust: blocked, then unverified, then verified', () => {
    expect(groupTrust(group({ trusted: 1 }, { trusted: 1 }))).toBe('verified');
    expect(groupTrust(group({ trusted: 1 }, { trusted: 0 }))).toBe('untrusted');
    expect(groupTrust(group({ trusted: 1 }, { trusted: -1 }))).toBe('blocked');
    expect(groupTrust(group({ trusted: 0 }, { trusted: -1 }))).toBe('blocked');
  });

  it('is active only when active in every version, usable unless blocked somewhere', () => {
    expect(isActive(model({}))).toBe(true);
    expect(isActive(model({ active: false }))).toBe(false);
    expect(isGroupActive(group({}, { active: false }))).toBe(false);
    expect(isGroupUsable(group({ trusted: 0 }, { trusted: 1 }))).toBe(true);
    expect(isGroupUsable(group({ trusted: 1 }, { trusted: -1 }))).toBe(false);
    expect(isGroupUsable(group({ trusted: 1 }, { active: false }))).toBe(false);
  });
});

describe('toDevice', () => {
  it('reads the id as a number, the first fingerprint found, and flags our own devices', () => {
    const groups = groupById(ME, [
      [model({ id: '4242', jid: ME, trusted: 1 })],
      [model({ id: 4242, jid: ME, trusted: 1, bundle: { fingerprint: 'ab'.repeat(32) } })],
    ]);
    expect(groups[0] && toDevice(groups[0], ME)).toEqual({
      jid: ME,
      deviceId: 4242,
      fingerprint: 'ab'.repeat(32),
      trust: 'verified',
      isOwn: true,
    });
  });

  it('gives a device without a published bundle an empty fingerprint', () => {
    const [group] = groupById(BOB, [[model({ id: 7, jid: BOB })]]);
    expect(group && toDevice(group, ME)).toMatchObject({
      deviceId: 7,
      fingerprint: '',
      trust: 'untrusted',
      isOwn: false,
    });
  });
});

describe('isRoom', () => {
  it('recognizes Converse MUC models by their type', () => {
    const chat = (type: string) => ({ get: () => type }) as unknown as Parameters<typeof isRoom>[0];
    expect(isRoom(chat('chatroom'))).toBe(true);
    expect(isRoom(chat('chatbox'))).toBe(false);
  });
});
