import { DomainError } from '../../contracts/errors';
import type { RoomAdminRepository, RoomRepository } from '../../contracts/repositories';
import type { Room, RoomAffiliate, RoomAffiliation, RoomSettings } from '../../contracts/types';
import type { ConverseEngine, Loaded } from './engine';
import { JoinWatch } from './room-join';

const MUC_OWNER = 'http://jabber.org/protocol/muc#owner';
const MUC_USER = 'http://jabber.org/protocol/muc#user';
const ROOMCONFIG = 'http://jabber.org/protocol/muc#roomconfig';
const LISTS: RoomAffiliation[] = ['owner', 'admin', 'member', 'outcast'];

type DestroyedHandler = (jid: string, reason?: string) => void;

/**
 * Halls as their owner or admin, over Converse 14 and raw XEP-0045 stanzas where Converse has
 * no API (spec 2026-10-16-halls-slack-design, section 5). Logs carry room JIDs and error codes,
 * never names, topics or reasons.
 */
export class ConverseRoomAdminRepository implements RoomAdminRepository {
  private readonly destroyedHandlers = new Set<DestroyedHandler>();
  /** One report per destroy, whether we asked for it or the server told us. */
  private readonly reported = new Set<string>();
  private watch: unknown = null;

  constructor(
    private readonly engine: ConverseEngine,
    private readonly rooms: RoomRepository,
    private readonly joinTimeoutMs = 20_000,
  ) {
    for (const event of ['connected', 'reconnected']) {
      engine.on(event, () => this.watchDestroys());
    }
  }

  async create(input: {
    service: string;
    localpart: string;
    nick: string;
    settings: RoomSettings;
  }): Promise<Room> {
    const loaded = await this.engine.ready();
    const jid = `${input.localpart}@${input.service}`.toLowerCase();
    if (await this.exists(loaded, jid)) throw new DomainError('RoomExists');
    const watch = new JoinWatch(loaded, jid);
    try {
      // Locked until configured: never open with the server's defaults.
      const chat = await loaded.api.rooms.get(
        jid,
        {
          nick: input.nick,
          hidden: true,
          auto_configure: true,
          roomconfig: roomConfig(input.settings),
        },
        true,
      );
      if (!chat) throw new DomainError('Unknown', 'Unknown: the room could not be created');
      await watch.outcome(chat, this.joinTimeoutMs);
    } finally {
      watch.release();
    }
    // Converse's own configuration step is never awaited: send the form again and await it.
    await this.submit(loaded, jid, input.settings);
    const created = (await this.rooms.list()).find((room) => room.jid === jid);
    if (!created) throw new DomainError('Unknown', 'Unknown: the new room is not listed');
    return {
      ...created,
      name: input.settings.name,
      visibility: input.settings.visibility,
      affiliation: 'owner',
    };
  }

  async settings(jid: string): Promise<RoomSettings> {
    const { api } = await this.engine.ready();
    const info = await api.disco.info(jid.toLowerCase(), null).catch((error: unknown) => {
      throw refusal(error, 'RoomNotFound');
    });
    const features = Array.from(info.getElementsByTagName('feature')).map((f) =>
      f.getAttribute('var'),
    );
    const name = info.getElementsByTagName('identity')[0]?.getAttribute('name') ?? '';
    return {
      name,
      description: formField(info, 'muc#roominfo_description'),
      visibility: features.includes('muc_membersonly') ? 'private' : 'public',
    };
  }

  async configure(jid: string, change: Partial<RoomSettings>): Promise<void> {
    await this.submit(await this.engine.ready(), jid.toLowerCase(), change);
  }

  async setTopic(jid: string, topic: string): Promise<void> {
    const chat = await this.room(jid);
    chat.setSubject(topic);
  }

  async invite(jid: string, inviteeJid: string): Promise<void> {
    const { api, env } = await this.engine.ready();
    // Mediated (§7.8.2): the server checks the right to invite and grants membership when needed.
    api.send(
      env.stx`<message to="${jid.toLowerCase()}" xmlns="jabber:client"><x xmlns="${MUC_USER}"><invite to="${inviteeJid}"/></x></message>`,
    );
  }

  async setAffiliation(jid: string, userJid: string, affiliation: RoomAffiliation): Promise<void> {
    const { api } = await this.engine.ready();
    await api.rooms.affiliations
      .set(jid.toLowerCase(), { jid: userJid, affiliation })
      .catch((error: unknown) => {
        throw refusal(error, 'NotAllowed');
      });
  }

  async kick(jid: string, nick: string): Promise<void> {
    const chat = await this.room(jid);
    const occupant = chat.getOccupant(nick);
    if (!occupant) return;
    await new Promise<void>((resolve, reject) =>
      chat.setRole(occupant, 'none', undefined, resolve, (error) =>
        reject(refusal(error, 'NotAllowed')),
      ),
    );
  }

  async affiliations(jid: string): Promise<RoomAffiliate[]> {
    const { api } = await this.engine.ready();
    const lists = await Promise.all(
      LISTS.map(async (affiliation) => {
        const found = await api.rooms.affiliations.get(affiliation, jid.toLowerCase());
        // Not allowed to read that list (or no answer): it is simply not shown.
        if (!Array.isArray(found)) return [];
        return found.flatMap((item: unknown) => toAffiliate(item, affiliation));
      }),
    );
    return lists.flat();
  }

  async destroy(jid: string, reason?: string): Promise<void> {
    const chat = await this.room(jid);
    await chat.sendDestroyIQ(reason).catch((error: unknown) => {
      throw refusal(error, 'NotAllowed');
    });
    await this.destroyed(jid.toLowerCase(), reason);
  }

  onDestroyed(handler: DestroyedHandler): () => void {
    this.destroyedHandlers.add(handler);
    return () => this.destroyedHandlers.delete(handler);
  }

  private async room(jid: string) {
    const { api } = await this.engine.ready();
    const chat = await api.rooms.get(jid.toLowerCase());
    if (!chat) throw new DomainError('RoomNotFound', 'RoomNotFound: the room is not joined');
    return chat;
  }

  /** disco#info answers for a room that exists; `item-not-found` means the address is free. */
  private async exists(loaded: Loaded, jid: string): Promise<boolean> {
    try {
      await loaded.api.disco.info(jid, null);
      return true;
    } catch (error) {
      if (error === null) {
        throw new DomainError(
          'ServerUnreachable',
          'ServerUnreachable: the hall service did not answer',
        );
      }
      return false;
    }
  }

  /** A partial owner form (§10.2): only the fields given change. */
  private async submit(loaded: Loaded, jid: string, change: Partial<RoomSettings>): Promise<void> {
    const { api, env } = loaded;
    const fields = Object.entries(formValues(change)).map(
      ([name, value]) => env.stx`<field var="${name}"><value>${String(value)}</value></field>`,
    );
    const form = env.stx`<iq type="set" to="${jid}" xmlns="jabber:client"><query xmlns="${MUC_OWNER}"><x xmlns="jabber:x:data" type="submit"><field var="FORM_TYPE"><value>${ROOMCONFIG}</value></field>${fields}</x></query></iq>`;
    await api.sendIQ(form).catch((error: unknown) => {
      throw refusal(error, 'NotAllowed');
    });
  }

  /**
   * Converse does not notice a destroy while we are inside (it reads status codes, not
   * `<destroy>`): the unavailable presence that carries it is caught here, the room closed.
   */
  private watchDestroys(): void {
    const connection = this.engine.current?.api.connection.get();
    if (!connection) return;
    if (this.watch) connection.deleteHandler(this.watch);
    this.watch = connection.addHandler(
      (stanza: Element) => {
        const destroy = stanza.getElementsByTagNameNS(MUC_USER, 'destroy')[0];
        if (destroy) {
          const jid = (stanza.getAttribute('from') ?? '').split('/')[0]?.toLowerCase() ?? '';
          const reason = destroy.getElementsByTagName('reason')[0]?.textContent ?? undefined;
          void this.destroyed(jid, reason || undefined);
        }
        return true;
      },
      null,
      'presence',
      'unavailable',
      null,
      null,
    );
  }

  private async destroyed(jid: string, reason?: string): Promise<void> {
    if (!jid || this.reported.has(jid)) return;
    this.reported.add(jid);
    const chat = await this.engine.current?.api.rooms.get(jid);
    await chat?.close().catch(() => undefined);
    for (const handler of this.destroyedHandlers) handler(jid, reason);
  }
}

/** What Converse's `auto_configure` fills, by field name without `muc#roomconfig_`. */
function roomConfig(settings: RoomSettings): Record<string, string | boolean> {
  const privately = settings.visibility === 'private';
  return {
    roomname: settings.name,
    roomdesc: settings.description,
    persistentroom: true,
    publicroom: !privately,
    membersonly: privately,
    // Sealed letters in a hall need real addresses: members see them in a private hall.
    whois: privately ? 'anyone' : 'moderators',
  };
}

/** The same settings as owner form fields, only those given. */
function formValues(change: Partial<RoomSettings>): Record<string, string | number> {
  const values: Record<string, string | number> = {};
  if (change.name !== undefined) values['muc#roomconfig_roomname'] = change.name;
  if (change.description !== undefined) values['muc#roomconfig_roomdesc'] = change.description;
  if (change.visibility !== undefined) {
    const privately = change.visibility === 'private';
    values['muc#roomconfig_persistentroom'] = 1;
    values['muc#roomconfig_publicroom'] = privately ? 0 : 1;
    values['muc#roomconfig_membersonly'] = privately ? 1 : 0;
    values['muc#roomconfig_whois'] = privately ? 'anyone' : 'moderators';
  }
  return values;
}

function formField(info: Element, name: string): string {
  const field = Array.from(info.getElementsByTagName('field')).find(
    (f) => f.getAttribute('var') === name,
  );
  return field?.getElementsByTagName('value')[0]?.textContent ?? '';
}

function toAffiliate(item: unknown, affiliation: RoomAffiliation): RoomAffiliate[] {
  if (!item || typeof item !== 'object') return [];
  const { jid, nick } = item as { jid?: unknown; nick?: unknown };
  if (typeof jid !== 'string' || !jid) return [];
  return [typeof nick === 'string' && nick ? { jid, nick, affiliation } : { jid, affiliation }];
}

/** An error stanza is a refusal; null is a timeout. */
function refusal(error: unknown, code: 'NotAllowed' | 'RoomNotFound'): DomainError {
  if (error instanceof DomainError) return error;
  if (error === null) return new DomainError('ServerUnreachable', 'ServerUnreachable: no answer');
  const condition =
    error instanceof Element
      ? error.getElementsByTagName('error')[0]?.firstElementChild?.localName
      : undefined;
  if (condition === 'item-not-found') return new DomainError('RoomNotFound', 'RoomNotFound');
  return new DomainError(code, `${code}: ${condition ?? 'refused'}`);
}
