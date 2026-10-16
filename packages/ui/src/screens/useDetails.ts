import { useCallback, useState } from 'react';

/** Whether the details pane is open, and which of its sections was asked for last. */
export function useDetails() {
  const [open, setOpen] = useState(false);
  const [encryptionFocus, setEncryptionFocus] = useState(0); // "Check their devices" requests
  const [peopleFocus, setPeopleFocus] = useState(0); // the hall header's people button
  // Stable: `useMainShortcuts` lists it among its keyboard listener's dependencies.
  const close = useCallback(() => setOpen(false), []);

  /**
   * The header button toggles the pane; a sealed letter opens it on its Encryption section, the
   * hall's people button on its People section.
   */
  function show(section?: 'encryption' | 'people') {
    setEncryptionFocus(section === 'encryption' ? (count) => count + 1 : 0);
    setPeopleFocus(section === 'people' ? (count) => count + 1 : 0);
    setOpen(section !== undefined || !open);
  }

  return { open, encryptionFocus, peopleFocus, show, close };
}
