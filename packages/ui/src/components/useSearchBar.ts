import { useEffect, useState } from 'react';

/**
 * Whether the conversation's search bar is open: Cmd/Ctrl+F opens it (not under a dialog), the
 * header's button too; closing it counts a request for the composer to take the focus back.
 */
export function useSearchBar() {
  const [open, setOpen] = useState(false);
  const [composerFocus, setComposerFocus] = useState(0);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (!(event.metaKey || event.ctrlKey) || event.key !== 'f') return;
      if (document.querySelector('[aria-modal="true"]')) return;
      event.preventDefault();
      setOpen(true);
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  function close() {
    setOpen(false);
    setComposerFocus((count) => count + 1);
  }

  return { open, show: () => setOpen(true), close, composerFocus };
}
