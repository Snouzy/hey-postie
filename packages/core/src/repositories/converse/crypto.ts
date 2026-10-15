import { DomainError } from '../../contracts/errors';
import type { CryptoRepository } from '../../contracts/repositories';
import type { Device, Trust } from '../../contracts/types';
import { DeviceListWatcher } from './crypto-lists';
import {
  type DeviceGroup,
  type DeviceModel,
  type EncryptableRoom,
  fingerprintOf,
  fromTrust,
  groupById,
  identityKeyOf,
  isGroupActive,
  isGroupUsable,
  isRoom,
  OMEMO_VERSIONS,
  type Omemo,
  omemoOf,
  SEEN_ATTRIBUTE,
  toDevice,
  VERIFIED_KEY_ATTRIBUTE,
} from './crypto-mappers';
import type { ConverseEngine } from './engine';

type Handler = (jid: string, devices: Device[]) => void;

/** A first sign-in generates the bundle (slow key generation) before `OMEMOInitialized`. */
const OMEMO_READY_TIMEOUT_MS = 30_000;
/** A removed own device that keeps coming back is re-published by another client of ours. */
const REMOVAL_ATTEMPTS = 3;

/**
 * OMEMO devices and trust over Converse's device lists (wiki/development/converse.md §8 and §15).
 * Converse does the encryption; this repository reads the lists as one device per id across the
 * two OMEMO versions, writes `trusted`, and the `DeviceListWatcher` adds the trust rules Converse
 * lacks.
 */
export class ConverseCryptoRepository implements CryptoRepository {
  private readonly handlers = new Set<Handler>();
  private readonly watcher = new DeviceListWatcher((jid) => this.schedule(jid));
  private readonly scheduled = new Set<string>();
  private removals: Promise<unknown> = Promise.resolve();
  /** Known after the account's disco: without a PEP service OMEMO can publish nothing. */
  private pepMissing = false;

  constructor(private readonly engine: ConverseEngine) {
    engine.on('statusInitialized', () => this.checkPep());
    // The device list collections are rebuilt at every login (`fetchDeviceLists`), just before this.
    engine.on('OMEMOInitialized', () => this.bindLists());
    engine.on('logout', () => {
      this.watcher.unbind();
      this.pepMissing = false;
    });
  }

  async devices(jid: string): Promise<Device[]> {
    const omemo = await this.ready();
    const groups = await this.groups(omemo, jid);
    await Promise.all(groups.map((group) => this.fingerprints(omemo, group)));
    return groups.filter(isGroupActive).map((group) => toDevice(group, omemo.ownJid));
  }

  async ownDevices(): Promise<Device[]> {
    const { ownJid } = await this.ready();
    return this.devices(ownJid);
  }

  async ownDeviceId(): Promise<number> {
    const { api } = await this.ready();
    return Number(await api.omemo.getDeviceID());
  }

  /** A verification is bound to the identity key it was made on (`DeviceListWatcher`). */
  async setTrust(jid: string, deviceId: number, trust: Trust): Promise<void> {
    const omemo = await this.ready();
    const group = await this.find(omemo, jid, deviceId);
    if (trust === 'verified') {
      await this.fingerprints(omemo, group);
      if (group.models.every((model) => identityKeyOf(model) === '')) {
        throw new DomainError('EncryptionUnavailable', 'EncryptionUnavailable: no published key');
      }
    }
    for (const model of group.models) {
      model.save({
        trusted: fromTrust(trust),
        [VERIFIED_KEY_ATTRIBUTE]: trust === 'verified' ? identityKeyOf(model) || null : null,
      });
    }
  }

  /** Removals run one at a time: see `remove`. */
  removeOwnDevice(deviceId: number): Promise<void> {
    const removal = this.removals.then(() => this.remove(deviceId));
    this.removals = removal.catch(() => undefined);
    return removal;
  }

  /** False, never an error, when OMEMO is not available at all (signed out, no PEP, bundle not ready). */
  async available(chatId: string): Promise<boolean> {
    const omemo = await this.ready().catch(() => null);
    if (!omemo) return false;
    const chat = await omemo.api.chats.get(chatId);
    if (chat && isRoom(chat)) return this.roomAvailable(omemo, chat);
    return this.hasUsableDevice(omemo, chatId);
  }

  /** `change:omemo_active` reaches the UI through the chat repository's `onChatChange`. */
  async setEncryption(chatId: string, enabled: boolean): Promise<void> {
    const omemo = await this.ready();
    const chat = await omemo.api.chats.get(chatId);
    if (!chat) throw new DomainError('Unknown', 'Unknown: no such chat');
    chat.save({ omemo_active: enabled });
    omemo.u.omemo.setOMEMOActiveState(chatId, enabled);
  }

  onDevicesChange(handler: Handler): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  /**
   * Signed out or without PEP, OMEMO never initializes: answer at once. Signed in, wait for
   * `OMEMOInitialized` (the first login generates the bundle) up to 30 s.
   */
  private async ready(): Promise<Omemo> {
    const loaded = await this.engine.ready();
    if (loaded.api.connection.authenticated() !== true) {
      throw new DomainError('EncryptionUnavailable', 'EncryptionUnavailable: not signed in');
    }
    if (this.pepMissing) {
      throw new DomainError(
        'EncryptionUnavailable',
        'EncryptionUnavailable: the server has no PEP',
      );
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new DomainError('EncryptionUnavailable')),
        OMEMO_READY_TIMEOUT_MS,
      );
    });
    try {
      await Promise.race([loaded.api.waitUntil('OMEMOInitialized'), timeout]);
    } finally {
      clearTimeout(timer);
    }
    return omemoOf(loaded);
  }

  /** `api.pubsub.publish` only warns when the account has no PEP identity: OMEMO would run blind. */
  private async checkPep(): Promise<void> {
    const loaded = this.engine.current;
    if (!loaded) return;
    const omemo = omemoOf(loaded);
    const identity = await omemo.api.disco
      .getIdentity('pubsub', 'pep', omemo.ownJid)
      .catch(() => undefined);
    // `getIdentity` resolves with the identity model, or undefined when the entity lacks it.
    this.pepMissing = identity === undefined || identity === null;
  }

  private async bindLists(): Promise<void> {
    const loaded = this.engine.current;
    if (!loaded) return;
    const omemo = omemoOf(loaded);
    this.watcher.unbind();
    this.watcher.bind(omemo, String(await omemo.api.omemo.getDeviceID()));
  }

  /**
   * Destroys the device in every version list and publishes the lists, then checks that it is
   * gone: the server echoes our list as a PEP event and Converse replays it onto the collection
   * (`updateDevicesFromStanza`), re-creating a device destroyed by a removal that started
   * meanwhile (found by the contract test, 2026-10-15); another client of ours re-publishes
   * itself as soon as it disappears. Bounded retries, then `Unknown`.
   */
  private async remove(deviceId: number): Promise<void> {
    const omemo = await this.ready();
    const id = String(deviceId);
    if (id === String(await omemo.api.omemo.getDeviceID())) {
      throw new DomainError('Unknown', 'Unknown: the current device cannot be removed');
    }
    await this.find(omemo, omemo.ownJid, deviceId);
    for (let attempt = 0; attempt < REMOVAL_ATTEMPTS; attempt++) {
      await this.retire(omemo, id);
      await this.settled(omemo);
      const group = (await this.groups(omemo, omemo.ownJid)).find((g) => g.id === id);
      if (!group || !isGroupActive(group)) return;
    }
    throw new DomainError('Unknown', 'Unknown: the device is re-published by another client');
  }

  /**
   * `removeOwnDevices` destroys the local model before publishing: when the publish fails (error
   * stanza, or null on timeout, `shared/api/send.js`) the device is put back as it was, so that
   * the view keeps matching the server, and the failure is surfaced.
   */
  private async retire(omemo: Omemo, id: string): Promise<void> {
    for (const version of OMEMO_VERSIONS) {
      const list = await omemo.api.omemo.devicelists.get(omemo.ownJid, false, version);
      const model = list?.devices.get(id);
      if (!list || !model) continue;
      const previous = { trusted: model.get('trusted'), [SEEN_ATTRIBUTE]: true };
      await list.removeOwnDevices([id]).catch((error: unknown) => {
        list.devices.create({ id, jid: omemo.ownJid, ...previous });
        const code = error === null ? 'ServerUnreachable' : 'Unknown';
        throw new DomainError(code, `${code}: the device list could not be published`, error);
      });
    }
  }

  /**
   * A session's stanzas are handled in order: once a ping is answered, the echo of our publish
   * has been processed. Strophe's own `sendIQ`: Converse's `api.sendIQ` leaves a detached
   * rejection on timeout (§13). A timeout still returns, the caller re-checks the list anyway.
   */
  private async settled(omemo: Omemo): Promise<void> {
    const domain = omemo.ownJid.split('@')[1] ?? '';
    const ping = omemo.env
      .stx`<iq type="get" to="${domain}" xmlns="jabber:client"><ping xmlns="urn:xmpp:ping"/></iq>` as Element;
    const connection = omemo.api.connection.get();
    if (connection) {
      await new Promise<void>((resolve) => {
        connection.sendIQ(
          ping,
          () => resolve(),
          () => resolve(),
          5000,
        );
      });
    }
    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  /** Both version lists of a JID, one group per device id. */
  private async groups(omemo: Omemo, jid: string): Promise<DeviceGroup[]> {
    const lists = await Promise.all(
      OMEMO_VERSIONS.map((version) => omemo.u.omemo.getDevicesForContact(jid, version)),
    );
    return groupById(
      jid,
      lists.map((list) => list.models),
    );
  }

  /** The group of one device; `DeviceNotFound` when no version list has it. */
  private async find(omemo: Omemo, jid: string, deviceId: number): Promise<DeviceGroup> {
    const group = (await this.groups(omemo, jid)).find((g) => g.id === String(deviceId));
    if (!group) throw new DomainError('DeviceNotFound');
    return group;
  }

  /** A device without a published bundle stays listed, with an empty fingerprint. */
  private async fingerprints(omemo: Omemo, group: DeviceGroup): Promise<void> {
    await Promise.all(
      group.models.map((model: DeviceModel) =>
        omemo.u.omemo.generateFingerprint(model).catch(() => undefined),
      ),
    );
  }

  /** Usable (active, not blocked) and with a bundle Converse can build a session from. */
  private async hasUsableDevice(omemo: Omemo, jid: string): Promise<boolean> {
    const usable = (await this.groups(omemo, jid)).filter(isGroupUsable);
    await Promise.all(usable.map((group) => this.fingerprints(omemo, group)));
    return usable.some((group) => group.models.some((model) => fingerprintOf(model) !== ''));
  }

  /**
   * Converse's `isOMEMOMUCEligible` plus the spec's rule applied to the present occupants: every
   * other occupant has a JID with a usable device.
   */
  private async roomAvailable(omemo: Omemo, room: EncryptableRoom): Promise<boolean> {
    if (!room.features.get('nonanonymous') || !room.features.get('membersonly')) return false;
    const others = room.occupants.models.filter((occupant) => occupant.get('jid') !== omemo.ownJid);
    const usable = await Promise.all(
      others.map((occupant) => {
        const jid = occupant.get('jid');
        return typeof jid === 'string' && jid !== '' ? this.hasUsableDevice(omemo, jid) : false;
      }),
    );
    return usable.every(Boolean);
  }

  /** One notification per JID per tick: a list update fires one `add` per device. */
  private schedule(jid: string): void {
    if (this.scheduled.has(jid)) return;
    this.scheduled.add(jid);
    setTimeout(() => {
      this.scheduled.delete(jid);
      this.devices(jid)
        .then((devices) => {
          for (const handler of this.handlers) handler(jid, devices);
        })
        .catch(() => console.warn('crypto: devices.changed dropped', jid));
    }, 0);
  }
}
