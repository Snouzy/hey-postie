import {
  CONVERSE_TRUST,
  type DeviceListModel,
  type DeviceModel,
  fingerprintOf,
  identityKeyOf,
  OMEMO_VERSIONS,
  type Omemo,
  SEEN_ATTRIBUTE,
  toTrust,
  VERIFIED_KEY_ATTRIBUTE,
} from './crypto-mappers';
import type { CollectionLike, Handler } from './models';

interface Binding {
  collection: CollectionLike<unknown>;
  event: string;
  handler: Handler;
}

/**
 * Watches Converse's device list collections for one session and applies the trust rules Converse
 * lacks (wiki/development/converse.md §15): a new device is not trusted blindly once the contact
 * has a verified one (or when it claims to be ours), and a verification is bound to the identity
 * key it was made on. Reports every change of a JID's devices through `onChange`.
 */
export class DeviceListWatcher {
  private bindings: Binding[] = [];

  constructor(private readonly onChange: (jid: string) => void) {}

  /** Binds both version collections of a fresh session: existing lists and the ones added later. */
  bind(omemo: Omemo, currentDeviceId: string): void {
    for (const collection of [omemo.state.devicelists, omemo.state.devicelists_v2]) {
      if (!collection) continue;
      for (const list of collection.models) this.bindList(omemo, currentDeviceId, list);
      this.listen(collection, 'add', (list) =>
        this.bindList(omemo, currentDeviceId, list as DeviceListModel),
      );
    }
  }

  /** The collections are rebuilt at every login: the previous session's handlers go away. */
  unbind(): void {
    for (const { collection, event, handler } of this.bindings) collection.off(event, handler);
    this.bindings = [];
  }

  /** Our own list is filled before `OMEMOInitialized`: the devices already there are decided too. */
  private bindList(omemo: Omemo, currentDeviceId: string, list: DeviceListModel): void {
    const jid = String(list.get('jid'));
    const decide = (model: unknown) => {
      this.decide(omemo, currentDeviceId, jid, model as DeviceModel).catch(() =>
        console.warn('crypto: trust rule skipped', jid),
      );
    };
    for (const model of list.devices.models) decide(model);
    this.listen(list.devices, 'add', decide);
    this.listen(list.devices, 'change:bundle', (model) =>
      this.onBundleChanged(jid, model as DeviceModel),
    );
    for (const event of ['remove', 'change:trusted', 'change:active']) {
      this.listen(list.devices, event, () => this.onChange(jid));
    }
  }

  private listen(collection: CollectionLike<unknown>, event: string, handler: Handler): void {
    collection.on(event, handler);
    this.bindings.push({ collection, event, handler });
  }

  /**
   * Spec 3.6, on a device the repository has not decided on yet. Both version lists are awaited
   * first: the same device known in the other version (or restored there from storage) is not new,
   * it inherits that state. Otherwise it is excluded (`-1`, shown `blocked`) until the user
   * decides when it claims to be one of ours, or when the contact already has a verified device.
   * The marker and the verdict are written in one `save`, so a crash leaves no half-decided device.
   */
  private async decide(
    omemo: Omemo,
    currentDeviceId: string,
    jid: string,
    model: DeviceModel,
  ): Promise<void> {
    if (!model.get(SEEN_ATTRIBUTE)) {
      await Promise.all(
        OMEMO_VERSIONS.map((version) =>
          omemo.api.omemo.devicelists.get(jid, false, version).catch(() => null),
        ),
      );
      const id = String(model.get('id'));
      const known = this.siblings(omemo, jid, id).find(
        (other) => other !== model && other.get(SEEN_ATTRIBUTE),
      );
      if (known) {
        model.save({ [SEEN_ATTRIBUTE]: true, trusted: known.get('trusted') });
      } else {
        const own = jid === omemo.ownJid;
        const exclude =
          toTrust(model.get('trusted')) === 'untrusted' &&
          (own ? id !== currentDeviceId : this.hasVerifiedDevice(omemo, jid, id));
        model.save({
          [SEEN_ATTRIBUTE]: true,
          ...(exclude ? { trusted: CONVERSE_TRUST.untrusted } : {}),
        });
      }
    }
    this.onChange(jid);
  }

  /**
   * A bundle pushed by the server replaces the one the user verified: if its identity key differs,
   * the verification is void and the device excluded. The fingerprint of a fresh bundle is computed
   * by the next `devices()`, which the change notification triggers.
   */
  private onBundleChanged(jid: string, model: DeviceModel): void {
    const verifiedKey = model.get(VERIFIED_KEY_ATTRIBUTE);
    const key = identityKeyOf(model);
    if (
      typeof verifiedKey === 'string' &&
      key !== '' &&
      key !== verifiedKey &&
      toTrust(model.get('trusted')) === 'verified'
    ) {
      model.save({ trusted: CONVERSE_TRUST.untrusted });
    }
    if (fingerprintOf(model) === '') this.onChange(jid);
  }

  /** Every model of one device id across the version lists. */
  private siblings(omemo: Omemo, jid: string, id: string): DeviceModel[] {
    return this.listsOf(omemo, jid).flatMap((list) =>
      list.devices.models.filter((model) => String(model.get('id')) === id),
    );
  }

  private hasVerifiedDevice(omemo: Omemo, jid: string, exceptId: string): boolean {
    return this.listsOf(omemo, jid).some((list) =>
      list.devices.models.some(
        (model) =>
          String(model.get('id')) !== exceptId && toTrust(model.get('trusted')) === 'verified',
      ),
    );
  }

  private listsOf(omemo: Omemo, jid: string): DeviceListModel[] {
    return [omemo.state.devicelists, omemo.state.devicelists_v2].flatMap((collection) => {
      const list = collection?.get(jid);
      return list ? [list] : [];
    });
  }
}
