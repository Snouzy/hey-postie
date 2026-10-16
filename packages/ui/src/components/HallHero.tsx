import type { Room, RoomSettings } from '@hey-postie/core';
import { Pencil } from 'lucide-react';
import { useState } from 'react';
import { useText } from '../core/CoreProvider';
import { EditHallDialog } from './EditHallDialog';

interface HallHeroProps {
  room: Room;
  /** The hall's configuration, null until the server answers (or when it will not say). */
  settings: RoomSettings | null;
  /** After an edit: the panel re-reads the settings and the halls. */
  onSaved: () => void;
}

/**
 * The top of the hall panel: its name (20px, heading font) and its description, up to six lines.
 * An owner gets a pencil, shown on hover or focus, that opens the edit dialog. Name and
 * description are the hall's text, never Postie's.
 */
export function HallHero({ room, settings, onSaved }: HallHeroProps) {
  const text = useText();
  const [editing, setEditing] = useState(false);
  const name = settings?.name || room.name;
  const description = settings?.description ?? '';
  return (
    <div className="group relative flex flex-col gap-1 pr-8">
      <h2 className="m-0 text-[20px] wrap-anywhere">{name}</h2>
      {description && (
        <p className="m-0 line-clamp-6 whitespace-pre-wrap wrap-anywhere" title={description}>
          {description}
        </p>
      )}
      {room.affiliation === 'owner' && (
        <button
          type="button"
          className="absolute top-0 right-0 flex size-7 cursor-pointer items-center justify-center rounded-sm border-none bg-transparent p-0 text-ink-muted opacity-0 transition-opacity duration-(--motion-fast) group-hover:opacity-100 hover:bg-paper-raised hover:text-ink focus-visible:opacity-100"
          aria-label={text('room.edit')}
          title={text('room.edit')}
          onClick={() => setEditing(true)}
        >
          <Pencil size={14} aria-hidden />
        </button>
      )}
      {editing && (
        <EditHallDialog
          room={room}
          settings={settings}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            onSaved();
          }}
        />
      )}
    </div>
  );
}
