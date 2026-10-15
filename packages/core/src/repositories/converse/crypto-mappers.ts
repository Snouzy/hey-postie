import type { Device, Trust } from '../../contracts/types';
import type { ChatModel, CollectionLike, ModelLike } from './models';

/**
 * The OMEMO slice of Converse (`plugins/omemo/`, wiki/development/converse.md §8 and §14) and the
 * pure mapping of its device models to `Device`. Converse keeps one device list per OMEMO version
 * and per JID; a physical device that speaks both versions appears in both lists with the same id.
 */

export const OMEMO_VERSIONS = ['eu.siacs.conversations.axolotl', 'urn:xmpp:omemo:2'] as const;
export type OmemoVersion = (typeof OMEMO_VERSIONS)[number];

/** Converse's `trusted` attribute (`plugins/omemo/constants.js`). */
export const CONVERSE_TRUST = { undecided: 0, trusted: 1, untrusted: -1 } as const;

/**
 * Our own marker, saved on every device the repository has seen once (`crypto.ts`): a device
 * without it is new to this client, which is what the "no more blind trust" rule needs to know.
 */
export const SEEN_ATTRIBUTE = 'hp_seen';

export type DeviceModel = ModelLike;

export interface DeviceListModel extends ModelLike {
  devices: CollectionLike<DeviceModel>;
  removeOwnDevices(deviceIds: string[]): Promise<unknown>;
}

export interface OccupantModel extends ModelLike {
  isSelf(): boolean;
}

export interface RoomModel extends ChatModel {
  features: ModelLike;
  occupants: CollectionLike<OccupantModel>;
}

export interface OmemoApi {
  omemo: {
    getDeviceID(): Promise<string | number>;
    devicelists: {
      get(jid: string, create?: boolean, version?: OmemoVersion): Promise<DeviceListModel | null>;
    };
  };
}

export interface OmemoUtils {
  omemo: {
    generateFingerprint(device: DeviceModel): Promise<void>;
    getDevicesForContact(jid: string, version: OmemoVersion): Promise<CollectionLike<DeviceModel>>;
    setOMEMOActiveState(jid: string, active: boolean): void;
  };
}

export interface OmemoState {
  devicelists?: CollectionLike<DeviceListModel>;
  devicelists_v2?: CollectionLike<DeviceListModel>;
}

/**
 * Converse never sets `trusted` to 1 by itself (checked in `plugins/omemo/utils.js`: only
 * `UNTRUSTED` is ever written), so 1 is always the user's own verification. 0 is "used without
 * verification" (blind trust, spec 3.6) and shows as `untrusted`; the `Trust` value `trusted` is
 * never produced.
 */
export function toTrust(trusted: unknown): Trust {
  if (trusted === CONVERSE_TRUST.trusted) return 'verified';
  if (trusted === CONVERSE_TRUST.untrusted) return 'blocked';
  return 'untrusted';
}

export function fromTrust(trust: Trust): -1 | 0 | 1 {
  if (trust === 'verified') return CONVERSE_TRUST.trusted;
  if (trust === 'blocked') return CONVERSE_TRUST.untrusted;
  return CONVERSE_TRUST.undecided;
}

export function toDevice(model: DeviceModel, ownJid: string): Device {
  const jid = String(model.get('jid') ?? '');
  const bundle = model.get('bundle') as { fingerprint?: unknown } | null | undefined;
  return {
    jid,
    deviceId: Number(model.get('id')),
    fingerprint: typeof bundle?.fingerprint === 'string' ? bundle.fingerprint : '',
    trust: toTrust(model.get('trusted')),
    isOwn: jid === ownJid,
  };
}

/** A device dropped from its owner's published list stays in storage as `active: false`. */
export function isActive(model: DeviceModel): boolean {
  return model.get('active') !== false;
}

/** The devices Converse encrypts for (`encryptKeyForDevices`): active and not excluded. */
export function isUsable(model: DeviceModel): boolean {
  return isActive(model) && toTrust(model.get('trusted')) !== 'blocked';
}

/** One entry per device id across the version lists; the legacy list comes first and wins. */
export function mergeVersions(lists: DeviceModel[][]): DeviceModel[] {
  const byId = new Map<string, DeviceModel>();
  for (const list of lists) {
    for (const model of list) {
      const id = String(model.get('id'));
      if (!byId.has(id)) byId.set(id, model);
    }
  }
  return [...byId.values()];
}

export function isRoom(chat: ChatModel): chat is RoomModel {
  return chat.get('type') === 'chatroom';
}
