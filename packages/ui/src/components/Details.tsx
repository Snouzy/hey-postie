import type { Chat, Contact } from '@hey-postie/core';
import { X } from 'lucide-react';
import { useState } from 'react';
import { useCore, useText } from '../core/CoreProvider';
import type { MessageKey } from '../i18n';
import { errorKey } from '../i18n/errors';
import { Avatar } from './Avatar';
import { Button } from './Button';
import { Dialog } from './Dialog';
import { EncryptionSection } from './EncryptionSection';

interface DetailsProps {
  chat: Chat;
  /** The contact behind the chat, when it is in the address book: gives the avatar. */
  contact?: Contact | undefined;
  onClose: () => void;
  /** Counts the "Check their devices" requests; each new one focuses the Encryption section. */
  focusRequest?: number;
}

/** The right pane: who the peer is, their devices, and the one destructive action. */
export function Details({ chat, contact, onClose, focusRequest = 0 }: DetailsProps) {
  const core = useCore();
  const text = useText();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<MessageKey | null>(null);

  async function remove() {
    try {
      await core.contacts.remove(chat.peerJid);
      onClose();
    } catch (caught) {
      setConfirming(false);
      setError(errorKey(caught));
    }
  }

  return (
    <aside
      className="flex w-[clamp(240px,var(--details-width,280px),480px)] shrink-0 flex-col gap-4 border-l border-line bg-paper p-4 overflow-y-auto"
      aria-label={text('main.details')}
    >
      <header className="flex items-center justify-between gap-2">
        <Avatar name={chat.title} jid={chat.peerJid} avatarUrl={contact?.avatarUrl} size={40} />
        <h2 className="min-w-0 flex-1 truncate text-[20px]">{chat.title}</h2>
        <Button variant="ghost" onClick={onClose} aria-label={text('main.closeDetails')}>
          <X size={18} aria-hidden />
        </Button>
      </header>
      <dl className="m-0 flex flex-col gap-1">
        <dt className="text-[12px] font-semibold text-ink-muted">{text('details.jid')}</dt>
        <dd className="m-0 font-mono text-[13px] wrap-anywhere">{chat.peerJid}</dd>
      </dl>
      <EncryptionSection jid={chat.peerJid} focusRequest={focusRequest} />
      <Button variant="danger" onClick={() => setConfirming(true)}>
        {text('details.removeContact')}
      </Button>
      {error && (
        <p className="m-0 font-heading [font-variation-settings:'SOFT'_100] text-red" role="alert">
          {text(error)}
        </p>
      )}
      {confirming && (
        <Dialog title={text('details.removeContact')} onClose={() => setConfirming(false)}>
          <p className="m-0">{text('details.confirmRemove')}</p>
          <div className="flex justify-end gap-2">
            <Button onClick={() => setConfirming(false)}>{text('dialog.cancel')}</Button>
            <Button variant="danger" onClick={() => void remove()}>
              {text('details.confirm')}
            </Button>
          </div>
        </Dialog>
      )}
    </aside>
  );
}
