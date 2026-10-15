import type { Device, Trust } from '../../contracts/types';
import type { Loaded } from './engine';
import type {
  ChatModel,
  CollectionLike,
  ConverseApi,
  ConverseEnv,
  ConverseState,
  ModelLike,
  RoomModel,
} from './models';

/**
 * The OMEMO slice of Converse (`plugins/omemo/`, wiki/development/converse.md §8 and §15) and the
 * pure mapping of its device models to `Device`. Converse keeps one device list per OMEMO version
 * and per JID; a physical device that speaks both versions appears in both lists with the same id,
 * so the repository always reasons on the group of models sharing an id.
 */

export const OMEMO_VERSIONS = ['eu.siacs.conversations.axolotl', 'urn:xmpp:omemo:2'] as const;
export type OmemoVersion = (typeof OMEMO_VERSIONS)[number];

/** Converse's `trusted` attribute (`plugins/omemo/constants.js`). */
export const CONVERSE_TRUST = { undecided: 0, trusted: 1, untrusted: -1 } as const;

/**
 * Our own attributes on a device model. `hp_seen` marks a device the repository has decided on
 * once: a model without it is new to this client. `hp_verified_key` is the identity key the user
 * verified; a bundle with another key voids the verification.
 */
export const SEEN_ATTRIBUTE = 'hp_seen';
export const VERIFIED_KEY_ATTRIBUTE = 'hp_verified_key';

export type DeviceModel = ModelLike;

export interface DeviceListModel extends ModelLike {
  devices: CollectionLike<DeviceModel> & {
    create(attributes: Record<string, unknown>): DeviceModel;
  };
  /** Resolves once the stored devices (and, when empty, the server's list) are loaded. */
  initialized?: Promise<unknown>;
  removeOwnDevices(deviceIds: string[]): Promise<unknown>;
}

/** The MUC attributes OMEMO eligibility reads (`isOMEMOMUCEligible`, `plugins/omemo/utils.js`). */
export interface EncryptableRoom extends RoomModel {
  features: ModelLike;
}

export interface OmemoApi {
  omemo: {
    getDeviceID(): Promise<string | number>;
    devicelists: {
      get(jid: string, create?: boolean, version?: OmemoVersion): Promise<DeviceListModel | null>;
    };
  };
  disco: {
    getIdentity(category: string, type: string, jid: string): Promise<unknown>;
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

/** The Converse handles of one signed-in session, read at call time (`ownJid` changes per login). */
export interface Omemo {
  api: ConverseApi & OmemoApi;
  state: ConverseState & OmemoState;
  env: ConverseEnv;
  u: OmemoUtils;
  ownJid: string;
}

export function omemoOf(loaded: Loaded): Omemo {
  return {
    api: loaded.api as ConverseApi & OmemoApi,
    state: loaded.state as ConverseState & OmemoState,
    env: loaded.env,
    u: loaded.env.u as unknown as OmemoUtils,
    ownJid: String(loaded.state.session?.get('bare_jid') ?? ''),
  };
}

/** One physical device: its models in the version lists that know it, legacy first. */
export interface DeviceGroup {
  id: string;
  jid: string;
  models: DeviceModel[];
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

/** A device dropped from its owner's published list stays in storage as `active: false`. */
export function isActive(model: DeviceModel): boolean {
  return model.get('active') !== false;
}

export function fingerprintOf(model: DeviceModel): string {
  const bundle = model.get('bundle') as { fingerprint?: unknown } | null | undefined;
  return typeof bundle?.fingerprint === 'string' ? bundle.fingerprint : '';
}

export function identityKeyOf(model: DeviceModel): string {
  const bundle = model.get('bundle') as { identity_key?: unknown } | null | undefined;
  return typeof bundle?.identity_key === 'string' ? bundle.identity_key : '';
}

/** Groups the models of several version lists by device id, in the order of the lists. */
export function groupById(jid: string, lists: DeviceModel[][]): DeviceGroup[] {
  const groups = new Map<string, DeviceGroup>();
  for (const list of lists) {
    for (const model of list) {
      const id = String(model.get('id'));
      const group = groups.get(id) ?? { id, jid, models: [] };
      group.models.push(model);
      groups.set(id, group);
    }
  }
  return [...groups.values()];
}

/** The most restrictive state across versions: blocked, then unverified, then verified. */
export function groupTrust(group: DeviceGroup): Trust {
  const trusts = group.models.map((model) => toTrust(model.get('trusted')));
  if (trusts.includes('blocked')) return 'blocked';
  if (trusts.includes('untrusted')) return 'untrusted';
  return 'verified';
}

/** Inactive in any version list means its owner dropped it there: not shown, not encrypted to. */
export function isGroupActive(group: DeviceGroup): boolean {
  return group.models.every(isActive);
}

/** The devices Converse encrypts for (`encryptKeyForDevices`): active and not excluded. */
export function isGroupUsable(group: DeviceGroup): boolean {
  return isGroupActive(group) && groupTrust(group) !== 'blocked';
}

export function toDevice(group: DeviceGroup, ownJid: string): Device {
  return {
    jid: group.jid,
    deviceId: Number(group.id),
    fingerprint: group.models.map(fingerprintOf).find((fp) => fp !== '') ?? '',
    trust: groupTrust(group),
    isOwn: group.jid === ownJid,
  };
}

export function isRoom(chat: ChatModel): chat is EncryptableRoom {
  return chat.get('type') === 'chatroom';
}
