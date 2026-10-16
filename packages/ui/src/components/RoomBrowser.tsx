import { DomainError, type RoomInfo } from '@hey-postie/core';
import { Users } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { useCore, useText } from '../core/CoreProvider';
import type { MessageKey } from '../i18n';
import { errorKey } from '../i18n/errors';
import { Postie } from '../illustrations/Postie';
import { Button } from './Button';
import { EmptyState } from './EmptyState';
import { Field } from './Field';

interface RoomBrowserProps {
  domain: string;
  onDomainChange: (domain: string) => void;
  onPick: (jid: string) => void;
}

/** The public halls of a server: a domain, "Browse", then a list to pick from. */
export function RoomBrowser({ domain, onDomainChange, onPick }: RoomBrowserProps) {
  const core = useCore();
  const text = useText();
  const [rooms, setRooms] = useState<RoomInfo[] | null>(null);
  const [browsing, setBrowsing] = useState(false);
  const [error, setError] = useState<MessageKey | null>(null);

  async function browse(event: FormEvent) {
    event.preventDefault();
    setBrowsing(true);
    setError(null);
    try {
      setRooms(await core.rooms.browse(domain));
    } catch (caught) {
      setRooms(null);
      const badDomain = caught instanceof DomainError && caught.code === 'InvalidJid';
      setError(badDomain ? 'joinRoom.badDomain' : errorKey(caught));
    } finally {
      setBrowsing(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <form className="flex items-end gap-2 [&>:first-child]:flex-1" onSubmit={browse}>
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
        <p className="m-0 font-heading [font-variation-settings:'SOFT'_100] text-red" role="alert">
          {text(error)}
        </p>
      )}
      {browsing && (
        <p
          className="m-0 font-heading [font-variation-settings:'SOFT'_100] text-ink-muted"
          role="status"
        >
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
        <ul className="m-0 flex max-h-[240px] list-none flex-col gap-[2px] overflow-y-auto p-0">
          {rooms.map((room) => (
            <li key={room.jid}>
              <button
                type="button"
                className="flex w-full cursor-pointer flex-col gap-[2px] rounded-sm border-0 bg-transparent px-3 py-2 text-left text-ink transition-[background-color] duration-(--motion-fast) hover:bg-paper focus-visible:bg-paper"
                onClick={() => onPick(room.jid)}
              >
                <span className="font-semibold">{room.name}</span>
                <span className="font-mono text-[12px] text-ink-muted wrap-anywhere">
                  {room.jid}
                </span>
                {room.membersCount !== undefined && (
                  <span className="inline-flex items-center gap-1 text-[12px] text-ink-muted">
                    <Users size={12} aria-hidden />
                    {text('joinRoom.membersCount').replace('{count}', String(room.membersCount))}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
