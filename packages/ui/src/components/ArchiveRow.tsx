import { ChevronRight, Images } from 'lucide-react';
import { useText } from '../core/CoreProvider';

/** The details' way into "Media, links and documents" (`ArchivePanel`). */
export function ArchiveRow({ onOpen }: { onOpen: () => void }) {
  const text = useText();
  return (
    <button
      type="button"
      className="flex w-full cursor-pointer items-center gap-2 rounded-sm border-none bg-transparent p-2 text-left font-semibold text-ink hover:bg-fill-hover"
      onClick={onOpen}
    >
      <Images size={18} className="shrink-0 text-ink-muted" aria-hidden />
      <span className="min-w-0 flex-1">{text('archive.open')}</span>
      <ChevronRight size={16} className="shrink-0 text-ink-muted" aria-hidden />
    </button>
  );
}
