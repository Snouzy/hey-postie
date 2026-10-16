import { DomainError, type Room, type RoomInfo } from '@hey-postie/core';
import { SquarePlus } from 'lucide-react';
import { type FormEvent, useEffect, useRef, useState } from 'react';
import { useCore, useText } from '../core/CoreProvider';
import type { MessageKey } from '../i18n';
import { errorKey } from '../i18n/errors';
import { Postie } from '../illustrations/Postie';
import { Button } from './Button';
import { EmptyState } from './EmptyState';
import { Field } from './Field';
import { hallStyles } from './hallStyles';

interface RoomBrowserProps {
  domain: string;
  onDomainChange: (domain: string) => void;
  /** The server's hall service is known (or known to be unknown): the directory is read once. */
  ready: boolean;
  /** The nick to join with, the one the join form holds. */
  nick: string;
  /** The halls I am in: marked "Joined" instead of a button. */
  joined: ReadonlySet<string>;
  onJoined: (room: Room) => void;
  /** "Create the hall …": the caller opens the create dialog with that name. */
  onCreate: (name: string) => void;
}

/** A row's "Join": shown while the row is hovered or holds the focus. */
const JOIN =
  'shrink-0 px-3 py-1 text-[13px] opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100';

/**
 * Browse halls: the public halls of a server, read once the service is known and again on
 * "Look up". A search filters them by name, address or description; "Join" joins at once and
 * opens the hall; a hall I am in says "Joined". When no listed hall bears the name searched for,
 * a pinned row offers to create it. Names and descriptions are the server's text, shown as text.
 */
export function RoomBrowser({
  domain,
  onDomainChange,
  ready,
  nick,
  joined,
  onJoined,
  onCreate,
}: RoomBrowserProps) {
  const core = useCore();
  const text = useText();
  const [rooms, setRooms] = useState<RoomInfo[] | null>(null);
  const [browsing, setBrowsing] = useState(false);
  const [joining, setJoining] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [error, setError] = useState<MessageKey | null>(null);
  const requests = useRef(0);
  const read = useRef(false);

  async function browse() {
    requests.current += 1;
    const mine = requests.current;
    setBrowsing(true);
    setError(null);
    try {
      const found = await core.rooms.browse(domain);
      if (mine === requests.current) setRooms(found);
    } catch (caught) {
      if (mine !== requests.current) return;
      setRooms(null);
      const badDomain = caught instanceof DomainError && caught.code === 'InvalidJid';
      setError(badDomain ? 'joinRoom.badDomain' : errorKey(caught));
    } finally {
      if (mine === requests.current) setBrowsing(false);
    }
  }

  // The directory is read once, as soon as the server said where its halls are.
  // biome-ignore lint/correctness/useExhaustiveDependencies: `browse` reads the domain of that moment; a later edit waits for "Look up"
  useEffect(() => {
    if (!ready || read.current) return;
    read.current = true;
    void browse();
  }, [ready]);

  async function join(jid: string) {
    if (joining) return;
    setJoining(jid);
    setError(null);
    try {
      onJoined(await core.rooms.join({ jid, nick }));
    } catch (caught) {
      setError(errorKey(caught));
    } finally {
      setJoining(null);
    }
  }

  function lookUp(event: FormEvent) {
    event.preventDefault();
    void browse();
  }

  const needle = query.trim().toLowerCase();
  const shown = (rooms ?? []).filter(
    (room) =>
      !needle ||
      room.name.toLowerCase().includes(needle) ||
      room.jid.includes(needle) ||
      (room.description ?? '').toLowerCase().includes(needle),
  );
  // Buzz's rule: offered unless a listed hall bears exactly that name (or address).
  const canCreate =
    needle !== '' &&
    !(rooms ?? []).some(
      (room) => room.name.toLowerCase() === needle || room.jid.split('@')[0] === needle,
    );

  return (
    <div className="flex flex-col gap-3">
      <form className="flex items-end gap-2 [&>:first-child]:flex-1" onSubmit={lookUp}>
        <Field
          label={text('joinRoom.domain')}
          type="text"
          value={domain}
          onChange={(e) => onDomainChange(e.target.value)}
          required
        />
        <Button type="submit" disabled={browsing || !domain.trim()}>
          {text('joinRoom.browse')}
        </Button>
      </form>
      {error && (
        <p className={`${hallStyles.postie} text-red`} role="alert">
          {text(error)}
        </p>
      )}
      {browsing && (
        <p className={`${hallStyles.postie} text-ink-muted`} role="status">
          {text('joinRoom.browsing')}
        </p>
      )}
      {rooms && rooms.length === 0 && (
        <EmptyState
          illustration={<Postie mood="searching" label={text('postie.alt.searching')} size={80} />}
          title={text('joinRoom.noRoomsTitle')}
          sentence={text('joinRoom.noRooms')}
        />
      )}
      {rooms && rooms.length > 0 && (
        <>
          <Field
            label={text('joinRoom.search')}
            type="search"
            placeholder={text('joinRoom.searchPlaceholder')}
            value={query}
            autoComplete="off"
            onChange={(e) => setQuery(e.target.value)}
          />
          <ul
            className="m-0 flex max-h-[240px] list-none flex-col gap-[2px] overflow-y-auto p-0"
            aria-label={text('joinRoom.listed')}
          >
            {shown.map((room) => (
              <HallRow
                key={room.jid}
                room={room}
                joined={joined.has(room.jid)}
                busy={joining === room.jid}
                onJoin={() => void join(room.jid)}
              />
            ))}
          </ul>
          {shown.length === 0 && (
            <p className={`${hallStyles.postie} text-ink-muted`}>{text('joinRoom.noMatch')}</p>
          )}
          {canCreate && (
            <button
              type="button"
              className="flex w-full cursor-pointer items-center gap-2 rounded-sm border border-dashed border-line-strong bg-transparent px-3 py-2 text-left font-semibold text-navy hover:bg-fill-hover"
              onClick={() => onCreate(query.trim())}
            >
              <SquarePlus size={16} aria-hidden className="shrink-0" />
              <span className="truncate">
                {text('joinRoom.create').replace('{name}', () => query.trim())}
              </span>
            </button>
          )}
        </>
      )}
    </div>
  );
}

interface HallRowProps {
  room: RoomInfo;
  joined: boolean;
  busy: boolean;
  onJoin: () => void;
}

/** One listed hall: "name · N members · description" on one line, then "Join" or "Joined". */
function HallRow({ room, joined, busy, onJoin }: HallRowProps) {
  const text = useText();
  const count =
    room.membersCount === undefined
      ? null
      : text('joinRoom.membersCount').replace('{count}', String(room.membersCount));
  const line = [room.name, count, room.description].filter(Boolean).join(' · ');
  return (
    <li className="group flex items-center gap-2 rounded-sm px-3 py-2 hover:bg-fill-hover focus-within:bg-fill-hover">
      <span className="flex min-w-0 flex-1 flex-col" title={line}>
        <span className="truncate">
          <span className="font-semibold">{room.name}</span>
          {count && <span className="text-[13px] text-ink-muted"> · {count}</span>}
          {room.description && (
            <span className="text-[13px] text-ink-muted"> · {room.description}</span>
          )}
        </span>
        <span className="truncate font-mono text-[12px] text-ink-muted">{room.jid}</span>
      </span>
      {joined ? (
        <span className="shrink-0 text-[13px] font-semibold text-ink-muted">
          {text('joinRoom.joined')}
        </span>
      ) : (
        <Button
          className={JOIN}
          onClick={onJoin}
          disabled={busy}
          aria-busy={busy}
          aria-label={text('joinRoom.joinNamed').replace('{name}', () => room.name)}
        >
          {text('joinRoom.submit')}
        </Button>
      )}
    </li>
  );
}
