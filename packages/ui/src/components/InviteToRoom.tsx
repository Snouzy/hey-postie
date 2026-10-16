import type { Contact, Room } from '@hey-postie/core';
import { X } from 'lucide-react';
import { type FormEvent, type KeyboardEvent, useEffect, useId, useRef, useState } from 'react';
import { useCore, useText } from '../core/CoreProvider';
import type { MessageKey } from '../i18n';
import { errorKey } from '../i18n/errors';
import { Avatar } from './Avatar';
import { Button } from './Button';
import { Dialog } from './Dialog';
import { Field } from './Field';

interface InviteToRoomProps {
  room: Room;
  /** The address book, searched by name or address. */
  contacts: Contact[];
  onClose: () => void;
}

/** Someone chosen to be invited: a contact, or an address typed or pasted. */
interface Invitee {
  jid: string;
  name: string;
}

const HEADING =
  'mx-0 mt-0 mb-1 p-0 font-text text-[12px] font-bold tracking-[0.04em] text-ink-muted uppercase';
const ROW = 'flex items-center gap-2 rounded-sm px-2 py-1';
const NOTE = "m-0 font-heading [font-variation-settings:'SOFT'_100]";

/**
 * "Invite people" to a hall: search the address book or paste an address, "Add" each person
 * (they become chips, removable), then "Invite" sends one invitation each. Who is already in the
 * hall is listed apart, without "Add". Addresses are validated by the service, which says which
 * one is wrong.
 */
export function InviteToRoom({ room, contacts, onClose }: InviteToRoomProps) {
  const core = useCore();
  const text = useText();
  const errorId = useId();
  const form = useRef<HTMLFormElement>(null);
  const [query, setQuery] = useState('');
  const [chosen, setChosen] = useState<Invitee[]>([]);
  const [inside, setInside] = useState<ReadonlySet<string>>(new Set());
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<MessageKey | null>(null);

  // Who is in the hall now, and its members who are away (when the hall tells their addresses).
  useEffect(() => {
    let cancelled = false;
    core.rooms
      .people(room.jid)
      .then((people) => {
        if (cancelled) return;
        setInside(new Set(people.flatMap((person) => (person.jid ? [bareOf(person.jid)] : []))));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [core, room.jid]);

  const needle = query.trim().toLowerCase();
  const picked = new Set(chosen.map((invitee) => invitee.jid));
  const matches = (contact: Contact) =>
    !needle || contact.name.toLowerCase().includes(needle) || contact.jid.includes(needle);
  const candidates: Invitee[] = contacts
    .filter((contact) => !inside.has(contact.jid) && !picked.has(contact.jid) && matches(contact))
    .map(({ jid, name }) => ({ jid, name }));
  // A pasted address outside the address book: offered as it is, the service checks it.
  const typed =
    needle.includes('@') &&
    !/\s/.test(needle) &&
    !picked.has(needle) &&
    !inside.has(needle) &&
    !contacts.some((contact) => contact.jid === needle)
      ? { jid: needle, name: needle }
      : null;
  const results = typed ? [typed, ...candidates] : candidates;
  const already = contacts.filter((contact) => inside.has(contact.jid) && matches(contact));

  function add(invitee: Invitee) {
    setChosen((current) => [...current, invitee]);
    setQuery('');
    setError(null);
    form.current?.querySelector('input')?.focus({ preventScroll: true });
  }

  function remove(jid: string) {
    setChosen((current) => current.filter((invitee) => invitee.jid !== jid));
    form.current?.querySelector('input')?.focus({ preventScroll: true });
  }

  // Enter adds the first result while something is typed; on an empty field it sends.
  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== 'Enter' || !needle) return;
    event.preventDefault();
    const first = results[0];
    if (first) add(first);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (sending || chosen.length === 0) return;
    setSending(true);
    setError(null);
    try {
      await core.rooms.invite(
        room.jid,
        chosen.map((invitee) => invitee.jid),
      );
      onClose();
    } catch (caught) {
      setSending(false);
      setError(errorKey(caught));
    }
  }

  return (
    <Dialog
      title={text('invite.title').replace('{name}', room.name)}
      onClose={onClose}
      closable={!sending}
      size="medium"
    >
      <form ref={form} className="flex flex-col gap-3" onSubmit={submit}>
        <Field
          label={text('invite.search')}
          type="text"
          autoComplete="off"
          placeholder={text('signIn.jidPlaceholder')}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setError(null);
          }}
          onKeyDown={onKeyDown}
          disabled={sending}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
        />
        {chosen.length > 0 && (
          <ul className="m-0 flex list-none flex-wrap gap-1 p-0" aria-label={text('invite.chosen')}>
            {chosen.map((invitee) => (
              <li
                key={invitee.jid}
                className="inline-flex items-center gap-1 rounded-full border border-line bg-paper py-[2px] pr-[2px] pl-1 text-[13px]"
              >
                <Avatar name={invitee.name} jid={invitee.jid} size={20} />
                <span className="max-w-[180px] truncate font-semibold">{invitee.name}</span>
                <button
                  type="button"
                  className="flex size-6 cursor-pointer items-center justify-center rounded-full border-none bg-transparent p-0 text-ink-muted hover:bg-fill-hover hover:text-ink"
                  aria-label={text('invite.remove').replace('{name}', invitee.name)}
                  onClick={() => remove(invitee.jid)}
                  disabled={sending}
                >
                  <X size={14} aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        )}
        {error && (
          <p id={errorId} className={`${NOTE} text-red`} role="alert">
            {text(error)}
          </p>
        )}
        <div className="flex max-h-[280px] flex-col gap-3 overflow-y-auto">
          {results.length > 0 ? (
            <ul
              className="m-0 flex list-none flex-col gap-[2px] p-0"
              aria-label={text('invite.results')}
            >
              {results.map((invitee) => (
                <li key={invitee.jid} className={`${ROW} hover:bg-fill-hover`}>
                  <Person invitee={invitee} />
                  <Button
                    className="px-3 py-1 text-[13px]"
                    aria-label={text('invite.add').replace('{name}', invitee.name)}
                    onClick={() => add(invitee)}
                    disabled={sending}
                  >
                    {text('invite.addShort')}
                  </Button>
                </li>
              ))}
            </ul>
          ) : (
            <p className={`${NOTE} text-ink-muted`}>
              {text(needle ? 'invite.nobody' : 'invite.nobodyLeft')}
            </p>
          )}
          {already.length > 0 && (
            <section aria-label={text('invite.already')}>
              <h3 className={HEADING}>{text('invite.already')}</h3>
              <ul className="m-0 flex list-none flex-col gap-[2px] p-0">
                {already.map(({ jid, name }) => (
                  <li key={jid} className={ROW}>
                    <Person invitee={{ jid, name }} />
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
        <div className="flex justify-end gap-2">
          <Button onClick={onClose} disabled={sending}>
            {text('dialog.cancel')}
          </Button>
          <Button
            variant="primary"
            type="submit"
            disabled={sending || chosen.length === 0}
            aria-busy={sending}
          >
            {text(sending ? 'invite.sending' : 'invite.submit')}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

/** A person's stamp, name and address, as the "New chat" picker shows them. */
function Person({ invitee }: { invitee: Invitee }) {
  return (
    <>
      <Avatar name={invitee.name} jid={invitee.jid} size={28} />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate font-semibold">{invitee.name}</span>
        <span className="truncate font-mono text-[12px] text-ink-muted">{invitee.jid}</span>
      </span>
    </>
  );
}

function bareOf(jid: string): string {
  return (jid.split('/')[0] ?? jid).toLowerCase();
}
