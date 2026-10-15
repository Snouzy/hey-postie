import { DomainError } from '../../contracts/errors';
import type { CryptoRepository } from '../../contracts/repositories';
import type { Device, Trust } from '../../contracts/types';
import {
  CONVERSE_TRUST,
  type DeviceListModel,
  type DeviceModel,
  fromTrust,
  isActive,
  isRoom,
  isUsable,
  mergeVersions,
  OMEMO_VERSIONS,
  type OmemoApi,
  type OmemoState,
  type OmemoUtils,
  type RoomModel,
  SEEN_ATTRIBUTE,
  toDevice,
  toTrust,
} from './crypto-mappers';
import type { ConverseEngine, Loaded } from './engine';
import type { ConverseApi, ConverseEnv, ConverseState } from './models';

type Handler = (jid: string, devices: Device[]) => void;

/** A first sign-in generates the bundle (slow); a signed-out engine never initializes OMEMO. */
const OMEMO_READY_TIMEOUT_MS = 30_000;

interface Omemo {
  api: ConverseApi & OmemoApi;
  state: ConverseState & OmemoState;
  env: ConverseEnv;
  u: OmemoUtils;
  ownJid: string;
}

/**
 * OMEMO devices and trust over Converse's device lists (wiki/development/converse.md §8 and §14).
 * Converse does the encryption; this repository reads the lists, writes `trusted`, and adds the
 * one rule Converse lacks: once a contact has a verified device, a new one is not trusted blindly.
 */
export class ConverseCryptoRepository implements CryptoRepository {
  private readonly handlers = new Set<Handler>();
  private readonly boundLists = new WeakSet<DeviceListModel>();
  private readonly scheduled = new Set<string>();
  private removals: Promise<unknown> = Promise.resolve();

  constructor(private readonly engine: ConverseEngine) {
    // The device list collections are rebuilt at every login (`fetchDeviceLists`), just before this.
    engine.on('OMEMOInitialized', () => this.bindDeviceLists());
  }

  async devices(jid: string): Promise<Device[]> {
    const omemo = await this.ready();
    const models = await this.models(omemo, jid);
    await Promise.all(models.map((model) => this.fingerprint(omemo, model)));
    return models.filter(isActive).map((model) => toDevice(model, omemo.ownJid));
  }

  async ownDevices(): Promise<Device[]> {
    const { ownJid } = await this.ready();
    return this.devices(ownJid);
  }

  async ownDeviceId(): Promise<number> {
    const { api } = await this.ready();
    return Number(await api.omemo.getDeviceID());
  }

  async setTrust(jid: string, deviceId: number, trust: Trust): Promise<void> {
    const omemo = await this.ready();
    const models = await this.find(omemo, jid, deviceId);
    for (const model of models) model.save({ trusted: fromTrust(trust) });
  }

  /** Removals run one at a time: see `settled`. */
  removeOwnDevice(deviceId: number): Promise<void> {
    const removal = this.removals.then(() => this.remove(deviceId));
    this.removals = removal.catch(() => undefined);
    return removal;
  }

  /** False, never an error, when OMEMO is not available at all (signed out, bundle not ready). */
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

  private async ready(): Promise<Omemo> {
    const loaded = await this.engine.ready();
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

  private async remove(deviceId: number): Promise<void> {
    const omemo = await this.ready();
    if (String(deviceId) === String(await omemo.api.omemo.getDeviceID())) {
      throw new DomainError('Unknown', 'Unknown: the current device cannot be removed');
    }
    await this.find(omemo, omemo.ownJid, deviceId);
    for (const version of OMEMO_VERSIONS) {
      const list = await omemo.api.omemo.devicelists.get(omemo.ownJid, false, version);
      if (list?.devices.get(String(deviceId))) await list.removeOwnDevices([String(deviceId)]);
    }
    await this.settled(omemo);
  }

  /**
   * The server echoes our published list as a PEP event, which Converse replays onto the
   * collection (`updateDevicesFromStanza`), re-creating a device destroyed by a removal that
   * started meanwhile. A session's stanzas are handled in order: once a ping is answered, the
   * echo has been processed (found by the contract test, 2026-10-15).
   */
  private async settled(omemo: Omemo): Promise<void> {
    const domain = omemo.ownJid.split('@')[1] ?? '';
    const ping = omemo.env
      .stx`<iq type="get" to="${domain}" xmlns="jabber:client"><ping xmlns="urn:xmpp:ping"/></iq>`;
    // Strophe's own sendIQ: Converse's api.sendIQ leaves a detached rejection on timeout (§13).
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

  /** Both version lists of a JID, one model per device id. */
  private async models(omemo: Omemo, jid: string): Promise<DeviceModel[]> {
    const lists = await Promise.all(
      OMEMO_VERSIONS.map((version) => omemo.u.omemo.getDevicesForContact(jid, version)),
    );
    return mergeVersions(lists.map((list) => list.models));
  }

  /** The models of one device in every version list; `DeviceNotFound` when there is none. */
  private async find(omemo: Omemo, jid: string, deviceId: number): Promise<DeviceModel[]> {
    const models = await this.models(omemo, jid);
    const found = models.filter((model) => String(model.get('id')) === String(deviceId));
    if (found.length === 0) throw new DomainError('DeviceNotFound');
    return found;
  }

  /** A device without a published bundle stays listed, with an empty fingerprint. */
  private async fingerprint(omemo: Omemo, model: DeviceModel): Promise<void> {
    await omemo.u.omemo.generateFingerprint(model).catch(() => undefined);
  }

  private async hasUsableDevice(omemo: Omemo, jid: string): Promise<boolean> {
    return (await this.models(omemo, jid)).some(isUsable);
  }

  /** Converse's `isOMEMOMUCEligible` plus the spec's rule: every member has a usable device. */
  private async roomAvailable(omemo: Omemo, room: RoomModel): Promise<boolean> {
    if (!room.features.get('nonanonymous') || !room.features.get('membersonly')) return false;
    const others = room.occupants.models.filter((occupant) => !occupant.isSelf());
    const usable = await Promise.all(
      others.map((occupant) => {
        const jid = occupant.get('jid');
        return typeof jid === 'string' && jid !== '' ? this.hasUsableDevice(omemo, jid) : false;
      }),
    );
    return usable.every(Boolean);
  }

  private bindDeviceLists(): void {
    const loaded = this.engine.current;
    if (!loaded) return;
    const omemo = omemoOf(loaded);
    for (const collection of [omemo.state.devicelists, omemo.state.devicelists_v2]) {
      if (!collection) continue;
      for (const list of collection.models) this.bindList(omemo, list);
      collection.on('add', (list) => this.bindList(omemo, list as DeviceListModel));
    }
  }

  private bindList(omemo: Omemo, list: DeviceListModel): void {
    if (this.boundLists.has(list)) return;
    this.boundLists.add(list);
    const jid = String(list.get('jid'));
    list.devices.on('add', (model) => {
      this.applyTrustRule(omemo, jid, model as DeviceModel);
      this.schedule(jid);
    });
    for (const event of ['remove', 'change:trusted', 'change:active']) {
      list.devices.on(event, () => this.schedule(jid));
    }
  }

  /**
   * Spec 3.6: a new device of a contact who already has a verified device is excluded until the
   * user decides (it shows as `blocked`; verify or unblock lifts it). Devices restored from storage
   * carry the marker and are left alone; our own devices are never excluded.
   */
  private applyTrustRule(omemo: Omemo, jid: string, model: DeviceModel): void {
    if (model.get(SEEN_ATTRIBUTE)) return;
    model.save({ [SEEN_ATTRIBUTE]: true });
    if (jid === omemo.ownJid || toTrust(model.get('trusted')) !== 'untrusted') return;
    if (this.hasVerifiedDevice(omemo, jid, model)) {
      model.save({ trusted: CONVERSE_TRUST.untrusted });
    }
  }

  private hasVerifiedDevice(omemo: Omemo, jid: string, except: DeviceModel): boolean {
    return [omemo.state.devicelists, omemo.state.devicelists_v2].some((collection) =>
      collection
        ?.get(jid)
        ?.devices.models.some(
          (model) => model !== except && toTrust(model.get('trusted')) === 'verified',
        ),
    );
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

function omemoOf(loaded: Loaded): Omemo {
  return {
    api: loaded.api as ConverseApi & OmemoApi,
    state: loaded.state as ConverseState & OmemoState,
    env: loaded.env,
    u: loaded.env.u as unknown as OmemoUtils,
    ownJid: String(loaded.state.session?.get('bare_jid') ?? ''),
  };
}
