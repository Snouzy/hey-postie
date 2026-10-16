import { useEffect } from 'react';
import type { PaneSizes } from '../core/settings';
import type { OpenDialog } from './useMainDialogs';

interface Shortcuts {
  dialog: OpenDialog;
  openDialog: (dialog: OpenDialog) => void;
  sidebarCollapsed: boolean;
  updatePanes: (change: Partial<PaneSizes>) => void;
  closeDetails: () => void;
}

/** The main screen's keys: Cmd/Ctrl+K "Go to…", +N new chat, +B the sidebar, Esc the details. */
export function useMainShortcuts({
  dialog,
  openDialog,
  sidebarCollapsed,
  updatePanes,
  closeDetails,
}: Shortcuts): void {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key === 'k') {
        // "Go to…", the Slack way; another dialog keeps the keys.
        event.preventDefault();
        if (!dialog) openDialog('switcher');
      } else if ((event.metaKey || event.ctrlKey) && event.key === 'n') {
        event.preventDefault();
        if (!dialog) openDialog('newChat');
      } else if ((event.metaKey || event.ctrlKey) && event.key === 'b') {
        event.preventDefault();
        updatePanes({ sidebarCollapsed: !sidebarCollapsed });
      } else if (event.key === 'Escape' && !dialog) {
        // An open dialog takes Esc for itself (see Dialog).
        closeDetails();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [dialog, openDialog, sidebarCollapsed, updatePanes, closeDetails]);
}
