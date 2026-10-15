import { DomainError } from '../../contracts/errors';
import type { RoomInfo } from '../../contracts/types';
import type { ConverseApi } from './models';
import { toRoomInfo } from './room-mappers';

/** Above this many rooms the per-room disco#info (occupant count, description) is skipped. */
const INFO_LIMIT = 20;

/**
 * XEP-0045 §6.3-6.4: the rooms of a conference service are its disco#items. A user's domain is
 * not a service itself: its items are looked up for one with a `conference`/`text` identity.
 * The IQs are sent directly (`api.disco.items`/`info`): the disco entity cache would keep a
 * stale room list.
 */
export async function browseRooms(api: ConverseApi, domain: string): Promise<RoomInfo[]> {
  const service = await findRoomService(api, domain);
  if (!service) return [];
  const items = await itemsOf(api, service);
  const infos = await Promise.all(
    items.map((item) => (items.length <= INFO_LIMIT ? infoOf(api, item) : Promise.resolve(null))),
  );
  return items.map((item, index) => toRoomInfo(item, infos[index]));
}

/** The domain itself when it is a MUC service, else the first of its items that is one. */
export async function findRoomService(api: ConverseApi, domain: string): Promise<string | null> {
  if (await isConferenceService(api, domain)) return domain;
  const items = await itemsOf(api, domain);
  for (const item of items) {
    const jid = item.getAttribute('jid');
    if (jid && (await isConferenceService(api, jid))) return jid;
  }
  return null;
}

async function isConferenceService(api: ConverseApi, jid: string): Promise<boolean> {
  try {
    return Boolean(await api.disco.getIdentity('conference', 'text', jid));
  } catch {
    return false;
  }
}

async function itemsOf(api: ConverseApi, jid: string): Promise<Element[]> {
  try {
    const result = await api.disco.items(jid);
    return Array.from(result.getElementsByTagName('item')).filter((item) =>
      item.getAttribute('jid'),
    );
  } catch (error) {
    throw new DomainError(
      'ServerUnreachable',
      'ServerUnreachable: the room list did not answer',
      error,
    );
  }
}

async function infoOf(api: ConverseApi, item: Element): Promise<Element | null> {
  try {
    return await api.disco.info(item.getAttribute('jid') ?? '');
  } catch {
    return null;
  }
}
