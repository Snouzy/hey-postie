import { DomainError } from '../contracts/errors';
import type { CryptoRepository } from '../contracts/repositories';
import type { Device, Trust } from '../contracts/types';

type Handler = (jid: string, devices: Device[]) => void;

/** In-memory OMEMO state. Tests seed devices with `seed()`; `ownJid` marks our own ones. */
export class FakeCrypto implements CryptoRepository {
  ownJid = 'me@example.org';
  private readonly byJid = new Map<string, Device[]>();
  readonly encryption = new Map<string, boolean>();
  private readonly handlers = new Set<Handler>();

  seed(
    jid: string,
    ...devices: Array<Pick<Device, 'deviceId' | 'fingerprint'> & { trust?: Trust }>
  ) {
    this.byJid.set(
      jid,
      devices.map((d) => ({
        jid,
        deviceId: d.deviceId,
        fingerprint: d.fingerprint,
        trust: d.trust ?? 'untrusted',
        isOwn: jid === this.ownJid,
      })),
    );
    this.notify(jid);
  }

  async devices(jid: string): Promise<Device[]> {
    return [...(this.byJid.get(jid) ?? [])];
  }

  async ownDevices(): Promise<Device[]> {
    return this.devices(this.ownJid);
  }

  async ownDeviceId(): Promise<number> {
    return this.byJid.get(this.ownJid)?.[0]?.deviceId ?? 1;
  }

  async setTrust(jid: string, deviceId: number, trust: Trust): Promise<void> {
    const device = this.byJid.get(jid)?.find((d) => d.deviceId === deviceId);
    if (!device) throw new DomainError('DeviceNotFound');
    device.trust = trust;
    this.notify(jid);
  }

  /** Like the real repository: this device cannot retire itself; an unknown id is refused. */
  async removeOwnDevice(deviceId: number): Promise<void> {
    const devices = this.byJid.get(this.ownJid) ?? [];
    if (deviceId === (await this.ownDeviceId())) {
      throw new DomainError('Unknown', 'Unknown: this device cannot remove itself');
    }
    if (!devices.some((d) => d.deviceId === deviceId)) throw new DomainError('DeviceNotFound');
    this.byJid.set(
      this.ownJid,
      devices.filter((d) => d.deviceId !== deviceId),
    );
    this.notify(this.ownJid);
  }

  async available(chatId: string): Promise<boolean> {
    return (this.byJid.get(chatId) ?? []).some((d) => d.trust !== 'blocked');
  }

  async setEncryption(chatId: string, enabled: boolean): Promise<void> {
    this.encryption.set(chatId, enabled);
  }

  onDevicesChange(handler: Handler): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  private notify(jid: string): void {
    const devices = [...(this.byJid.get(jid) ?? [])];
    for (const handler of this.handlers) handler(jid, devices);
  }
}
