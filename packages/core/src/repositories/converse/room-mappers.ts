import type { Room, RoomInfo, RoomMember, RoomNotify } from '../../contracts/types';
import { displayName, number, string } from './mappers';
import type { BookmarkModel, OccupantModel, RoomModel } from './models';

/** Pure mappings for rooms (MUC). Attribute names: wiki/development/converse.md, "Rooms (MUC)". */

export interface RoomContext {
  /** `ROOMSTATUS.ENTERED`, the only status that means "in the room". */
  enteredStatus: number;
  notify: RoomNotify;
}

/**
 * A room is a joined MUC model, a bookmark, or both: a bookmark alone is a room we are not in.
 * `num_unread` counts the messages that mention us, `num_unread_general` all of them
 * (`plugins/muc/muc.js:85-94`).
 */
export function toRoom(
  model: RoomModel | undefined,
  bookmark: BookmarkModel | undefined,
  context: RoomContext,
): Room {
  const jid = string(model?.get('jid') ?? bookmark?.get('jid'));
  const name = string(model?.get('name')) || string(bookmark?.get('name'));
  const subject = model?.get('subject');
  const topic =
    subject && typeof subject === 'object' ? string((subject as { text?: unknown }).text) : '';
  const room: Room = {
    jid,
    name: displayName(name, jid),
    nick: string(model?.get('nick')) || string(bookmark?.get('nick')),
    joined: model?.session?.get('connection_status') === context.enteredStatus,
    bookmarked: bookmark !== undefined,
    notify: context.notify,
    unreadCount: number(model?.get('num_unread_general')),
    mentionsCount: number(model?.get('num_unread')),
  };
  return topic ? { ...room, topic } : room;
}

export function toRoomMember(occupant: OccupantModel): RoomMember {
  const jid = bare(string(occupant.get('jid')));
  const member: RoomMember = {
    nick: string(occupant.get('nick')),
    role: role(occupant.get('role')),
    affiliation: affiliation(occupant.get('affiliation')),
  };
  return jid ? { ...member, jid } : member;
}

/** A disco#items `<item>` of the conference service, plus its disco#info when it was fetched. */
export function toRoomInfo(item: Element, info?: Element | null): RoomInfo {
  const jid = item.getAttribute('jid') ?? '';
  const identity = info?.getElementsByTagName('identity')[0]?.getAttribute('name');
  const room: RoomInfo = {
    jid,
    name: displayName(item.getAttribute('name') || identity, jid),
  };
  const occupants = Number(field(info, 'muc#roominfo_occupants'));
  const description = field(info, 'muc#roominfo_description');
  return {
    ...room,
    ...(Number.isInteger(occupants) && occupants >= 0 ? { membersCount: occupants } : {}),
    ...(description ? { description } : {}),
  };
}

function field(info: Element | null | undefined, name: string): string | undefined {
  if (!info) return undefined;
  for (const element of Array.from(info.getElementsByTagName('field'))) {
    if (element.getAttribute('var') === name) {
      return element.getElementsByTagName('value')[0]?.textContent ?? undefined;
    }
  }
  return undefined;
}

function role(value: unknown): RoomMember['role'] {
  return value === 'moderator' || value === 'visitor' ? value : 'participant';
}

function affiliation(value: unknown): RoomMember['affiliation'] {
  return value === 'owner' || value === 'admin' || value === 'member' || value === 'outcast'
    ? value
    : 'none';
}

function bare(jid: string): string {
  return jid.split('/')[0] ?? jid;
}
