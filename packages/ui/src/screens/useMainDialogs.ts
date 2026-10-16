import { useState } from 'react';
import type { SettingsSection } from '../components/settings/sections';

export type OpenDialog =
  | 'switcher'
  | 'newChat'
  | 'createRoom'
  | 'joinRoom'
  | 'browseRooms'
  | 'addContact'
  | 'myDevices'
  | 'settings'
  | 'licenses'
  | 'deleteAccount'
  | null;

/** The dialogs that open in place of the settings window, which comes back when they close. */
type FromSettings = 'licenses' | 'deleteAccount';

/** The one dialog open over the main screen, and what it remembers while open. */
export function useMainDialogs() {
  const [dialog, setDialog] = useState<OpenDialog>(null);
  const [settingsSection, setSettingsSection] = useState<SettingsSection>('general');
  // The settings window is behind the open dialog, and comes back with the focus on that button.
  const [settingsBehind, setSettingsBehind] = useState<FromSettings | null>(null);
  const [returnFocus, setReturnFocus] = useState<FromSettings | null>(null);
  const [createName, setCreateName] = useState(''); // "Create the hall …" from Browse halls

  function close() {
    setDialog(null);
    setCreateName('');
    setSettingsSection('general');
    setSettingsBehind(null);
    setReturnFocus(null);
  }

  /** Opens a dialog in place of the settings window; closing it reopens the window. */
  function fromSettings(next: FromSettings) {
    setSettingsBehind(next);
    setDialog(next);
  }

  function backToSettings() {
    setReturnFocus(settingsBehind);
    setSettingsBehind(null);
    setDialog('settings');
  }

  function createRoomNamed(name: string) {
    setCreateName(name);
    setDialog('createRoom');
  }

  return {
    dialog,
    open: setDialog,
    close,
    fromSettings,
    backToSettings,
    createRoomNamed,
    settingsSection,
    setSettingsSection,
    settingsBehind,
    returnFocus,
    createName,
  };
}

export type MainDialogs = ReturnType<typeof useMainDialogs>;
