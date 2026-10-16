import type { ArchiveKind, Chat } from '@hey-postie/core';
import { ArrowLeft, X } from 'lucide-react';
import { useState } from 'react';
import { useText } from '../core/CoreProvider';
import { ArchiveList } from './ArchiveList';
import type { SaveFile } from './Attachments';
import { Button } from './Button';

const KINDS: readonly ArchiveKind[] = ['media', 'link', 'document'];
// The sidebar's "Chats" / "Contacts" look: pressed buttons, not a tablist (ui.md, "Keyboard").
const TAB =
  'flex-1 cursor-pointer border-0 border-b-2 border-b-transparent bg-transparent p-2 font-semibold text-ink-muted transition-[color,border-color] duration-(--motion-fast) aria-pressed:border-b-navy aria-pressed:text-navy';

interface ArchivePanelProps {
  chat: Chat;
  /** Back to the contact's or the hall's details. */
  onBack: () => void;
  onClose: () => void;
  onOpenLink: (url: string) => void;
  onSaveFile: SaveFile;
  /** The letter an item came with, brought into view in the conversation. */
  onShowInChat: (messageId: string) => void;
}

/**
 * "Media, links and documents" (spec 2026-10-16 read sync and search, section 3), in place of
 * the details in the right pane, WhatsApp's way: three tabs over what `archive.collect` found.
 */
export function ArchivePanel({
  chat,
  onBack,
  onClose,
  onOpenLink,
  onSaveFile,
  onShowInChat,
}: ArchivePanelProps) {
  const text = useText();
  const [kind, setKind] = useState<ArchiveKind>('media');
  return (
    <aside
      className="flex w-[clamp(240px,var(--details-width,280px),480px)] shrink-0 flex-col gap-3 overflow-y-auto border-l border-line bg-paper p-4"
      aria-label={text('archive.open')}
    >
      <header className="flex items-center gap-1">
        <Button variant="ghost" onClick={onBack} aria-label={text('archive.back')}>
          <ArrowLeft size={18} aria-hidden />
        </Button>
        <h2 className="min-w-0 flex-1 truncate text-[18px]">{text('archive.open')}</h2>
        <Button variant="ghost" onClick={onClose} aria-label={text('main.closeDetails')}>
          <X size={18} aria-hidden />
        </Button>
      </header>
      <div className="flex border-b border-line">
        {KINDS.map((name) => (
          <button
            key={name}
            type="button"
            className={TAB}
            aria-pressed={kind === name}
            onClick={() => setKind(name)}
          >
            {text(`archive.tabs.${name}`)}
          </button>
        ))}
      </div>
      <ArchiveList
        key={kind}
        chatId={chat.id}
        kind={kind}
        // A hall's letters name their sender by nick; a direct chat's peer is the chat's title.
        peerName={chat.title}
        onOpenLink={onOpenLink}
        onSaveFile={onSaveFile}
        onShowInChat={onShowInChat}
      />
    </aside>
  );
}
