import type { ErrorCode } from '../../contracts/errors';
import { DomainError } from '../../contracts/errors';
import type { Loaded } from './engine';
import type { RoomModel } from './models';

/**
 * Watches one join. Converse reports the outcome through the room's `session`
 * `connection_status` (`plugins/muc/muc.js` `onErrorPresence`): ENTERED on the self-presence
 * (status code 110), PASSWORD_REQUIRED on `not-authorized`, NICKNAME_REQUIRED on `conflict`,
 * BANNED on an `auth` `forbidden`, and DISCONNECTED for everything else with only a localized
 * message to tell the cases apart. The error presence is therefore read here too, through a
 * Strophe handler on the room's bare JID registered before the model exists, since the refusal
 * can arrive while `api.rooms.get` still awaits the room's disco#info.
 */
export class JoinWatch {
  private error: DomainError | null = null;
  private settle: ((error?: DomainError) => void) | null = null;
  private readonly handler: unknown;

  constructor(
    private readonly loaded: Loaded,
    roomJid: string,
  ) {
    this.handler = loaded.api.connection.get()?.addHandler(
      (stanza) => {
        this.error ??= fromErrorPresence(stanza);
        this.settle?.(this.error);
        return true;
      },
      null,
      'presence',
      'error',
      null,
      roomJid,
      { matchBareFromJid: true },
    );
  }

  /** Resolves once the room is entered, rejects with the mapped error or on timeout. */
  outcome(chat: RoomModel, timeoutMs: number): Promise<void> {
    const { ENTERED, CONNECTING, CONNECTED } = this.loaded.roomStatus;
    const pending = new Set([CONNECTING, CONNECTED]);
    const session = chat.session;
    return new Promise<void>((resolve, reject) => {
      // Converse's presence handler runs before ours and sets the status first: a failed status
      // waits a moment for the error presence (which settles by itself) before concluding without it.
      const onStatus = () => {
        const status = Number(session?.get('connection_status'));
        if (status === ENTERED) this.settle?.();
        else if (!pending.has(status)) {
          setTimeout(
            () => this.settle?.(this.error ?? unexplained(status, this.loaded)),
            ERROR_PRESENCE_GRACE_MS,
          );
        }
      };
      const timer = setTimeout(
        () =>
          this.settle?.(
            new DomainError('ServerUnreachable', 'ServerUnreachable: the room did not answer'),
          ),
        timeoutMs,
      );
      this.settle = (error) => {
        clearTimeout(timer);
        session?.off('change:connection_status', onStatus);
        this.release();
        if (error) reject(error);
        else resolve();
      };
      session?.on('change:connection_status', onStatus);
      if (this.error) this.settle(this.error);
      else onStatus();
    });
  }

  release(): void {
    if (this.handler) this.loaded.api.connection.get()?.deleteHandler(this.handler);
  }
}

const ERROR_PRESENCE_GRACE_MS = 100;

/** XEP-0045 §7.2: the stanza error condition of the presence that refused us. */
function fromErrorPresence(stanza: Element): DomainError {
  const error = stanza.getElementsByTagName('error')[0];
  const condition = Array.from(error?.children ?? []).find(
    (child) =>
      child.namespaceURI === 'urn:ietf:params:xml:ns:xmpp-stanzas' && child.localName !== 'text',
  )?.localName;
  const code = CODE_BY_CONDITION[condition ?? ''] ?? 'Unknown';
  return new DomainError(
    code,
    `${code}: the room refused the join (${condition ?? 'no condition'})`,
  );
}

const CODE_BY_CONDITION: Record<string, ErrorCode> = {
  'not-authorized': 'RoomPasswordRequired',
  'item-not-found': 'RoomNotFound',
  forbidden: 'RoomBanned',
  conflict: 'NickTaken',
};

/** The status changed without an error presence: a kick, a destroyed room, a dropped connection. */
function unexplained(status: number, loaded: Loaded): DomainError {
  const { BANNED, PASSWORD_REQUIRED, NICKNAME_REQUIRED, DESTROYED } = loaded.roomStatus;
  if (status === BANNED) return new DomainError('RoomBanned', 'RoomBanned: banned from the room');
  if (status === PASSWORD_REQUIRED) {
    return new DomainError('RoomPasswordRequired', 'RoomPasswordRequired: the room has a password');
  }
  if (status === NICKNAME_REQUIRED) return new DomainError('NickTaken', 'NickTaken: nick refused');
  if (status === DESTROYED) return new DomainError('RoomNotFound', 'RoomNotFound: room destroyed');
  return new DomainError('Unknown', `Unknown: the join ended in room status ${String(status)}`);
}
