import type { Room } from '@hey-postie/core';
import { Pencil } from 'lucide-react';
import { type KeyboardEvent, useEffect, useRef, useState } from 'react';
import { useCore, useText } from '../core/CoreProvider';
import type { MessageKey } from '../i18n';
import { hallErrorKey } from '../i18n/errors';

interface HallTopicProps {
  room: Room;
  /** Whether a click edits it: the hall's owners and moderators, or a standing still unknown. */
  editable: boolean;
  /** Postie's sentence for a refusal, null once a new try starts; the header shows it. */
  onError: (error: MessageKey | null) => void;
}

const LINE = 'm-0 ml-2 min-w-0 flex-1 truncate text-[13px] text-ink-muted';

/**
 * The topic of a hall in the conversation header, on one line (the full text in `title`). For
 * those who may change it, a click turns it into a field: Enter saves through the service, Esc or
 * leaving the field cancels. The topic is the hall's text, shown as text.
 */
export function HallTopic({ room, editable, onError }: HallTopicProps) {
  const core = useCore();
  const text = useText();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  // The topic just saved, shown until the hall tells a topic of its own.
  const [saved, setSaved] = useState<{ topic: string; over: string | undefined } | null>(null);
  const button = useRef<HTMLButtonElement>(null);
  const field = useRef<HTMLInputElement>(null);
  const topic = saved && saved.over === room.topic ? saved.topic : (room.topic ?? '');

  useEffect(() => {
    if (editing) field.current?.focus();
  }, [editing]);

  function start() {
    setDraft(topic);
    setEditing(true);
    onError(null);
  }

  /** Back to the line; after Enter or Esc the focus returns to it, after a click away it stays there. */
  function stop(refocus: boolean) {
    setEditing(false);
    if (refocus) requestAnimationFrame(() => button.current?.focus());
  }

  async function save() {
    if (saving) return;
    setSaving(true);
    try {
      await core.rooms.setTopic(room.jid, draft);
      setSaved({ topic: draft.trim(), over: room.topic });
      stop(true);
    } catch (caught) {
      onError(hallErrorKey(caught));
    } finally {
      setSaving(false);
    }
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter') {
      event.preventDefault();
      void save();
    } else if (event.key === 'Escape') {
      // Esc cancels the edit only: the details pane behind stays open.
      event.preventDefault();
      event.stopPropagation();
      onError(null);
      stop(true);
    }
  }

  if (editing) {
    return (
      <input
        className="ml-2 min-w-0 flex-1 rounded-sm border border-line-strong bg-paper-raised px-2 py-1 text-[13px] text-ink focus-visible:border-navy"
        aria-label={text('room.topic')}
        value={draft}
        ref={field}
        // Read-only, not disabled, while saving: a disabled field would drop the focus.
        readOnly={saving}
        aria-busy={saving}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={onKeyDown}
        onBlur={() => !saving && stop(false)}
      />
    );
  }
  if (!editable) {
    return (
      <p className={LINE} title={topic}>
        {topic || text('room.topicEmpty')}
      </p>
    );
  }
  return (
    <button
      ref={button}
      type="button"
      className={`${LINE} group flex cursor-text items-center gap-1 rounded-sm border-none bg-transparent px-1 py-0 text-left hover:bg-fill-hover`}
      title={topic}
      onClick={start}
    >
      <span className="truncate">{topic || text('room.topicEmpty')}</span>
      <span className="sr-only"> {text('room.topicEdit')}</span>
      <Pencil
        size={12}
        aria-hidden
        className="shrink-0 opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100"
      />
    </button>
  );
}
