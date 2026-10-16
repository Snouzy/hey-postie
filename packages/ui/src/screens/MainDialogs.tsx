import type { Account, Chat, Contact, Room } from '@hey-postie/core';
import { AddContact } from '../components/AddContact';
import { CreateRoom } from '../components/CreateRoom';
import { DeleteAccountDialog } from '../components/DeleteAccountDialog';
import { JoinRoom } from '../components/JoinRoom';
import { Licenses } from '../components/Licenses';
import { MyDevices } from '../components/MyDevices';
import { NewChat } from '../components/NewChat';
import { QuickSwitcher } from '../components/QuickSwitcher';
import { SettingsWindow } from '../components/settings/SettingsWindow';
import type { MessageKey } from '../i18n';
import type { MainDialogs as Dialogs } from './useMainDialogs';

interface MainDialogsProps {
  account: Account;
  dialogs: Dialogs;
  chats: Chat[];
  contacts: Contact[];
  rooms: Room[];
  error: MessageKey | null;
  /** Closes the dialog and clears the error sentence. */
  onClose: () => void;
  onSelect: (chat: Chat) => void;
  onOpenWith: (jid: string) => void;
  onOpenRoom: (room: Room) => void;
  /** A hall just created: its invite dialog opens with it. */
  onInvite: (room: Room) => void;
  onSignOut: () => void;
  onDeleted: () => void;
  onOpenLink: (url: string) => void;
}

/** The dialog chosen in `useMainDialogs`, if any: one at a time over the main screen. */
export function MainDialogs({
  account,
  dialogs,
  chats,
  contacts,
  rooms,
  error,
  onClose,
  onSelect,
  onOpenWith,
  onOpenRoom,
  onInvite,
  onSignOut,
  onDeleted,
  onOpenLink,
}: MainDialogsProps) {
  const { dialog } = dialogs;
  switch (dialog) {
    case 'switcher':
      return (
        <QuickSwitcher
          chats={chats}
          contacts={contacts}
          onClose={onClose}
          onPick={(row) => {
            onClose();
            if (row.kind === 'chat') onSelect(row.chat);
            else onOpenWith(row.contact.jid);
          }}
        />
      );
    case 'newChat':
      return (
        <NewChat
          account={account}
          contacts={contacts}
          rooms={rooms}
          error={error}
          onOpen={onOpenWith}
          onJoined={(joined) => {
            onOpenRoom(joined);
            onClose();
          }}
          onClose={onClose}
        />
      );
    case 'createRoom':
      return (
        <CreateRoom
          account={account}
          initialName={dialogs.createName}
          // The new hall opens, and the invite dialog with it: a hall starts with its people.
          onCreated={(created) => {
            onOpenRoom(created);
            onClose();
            onInvite(created);
          }}
          onClose={onClose}
        />
      );
    case 'joinRoom':
    case 'browseRooms':
      return (
        <JoinRoom
          account={account}
          rooms={rooms}
          initialTab={dialog === 'browseRooms' ? 'browse' : 'address'}
          onCreate={dialogs.createRoomNamed}
          onJoined={(joined) => {
            onOpenRoom(joined);
            onClose();
          }}
          onClose={onClose}
        />
      );
    case 'addContact':
      return <AddContact onClose={onClose} />;
    case 'myDevices':
      return <MyDevices onClose={onClose} />;
    case 'settings':
      return (
        <SettingsWindow
          account={account}
          section={dialogs.settingsSection}
          onSelectSection={dialogs.setSettingsSection}
          onClose={onClose}
          onSignOut={onSignOut}
          onDeleteAccount={() => dialogs.fromSettings('deleteAccount')}
          onLicenses={() => dialogs.fromSettings('licenses')}
          onOpenLink={onOpenLink}
          returnFocus={dialogs.returnFocus}
        />
      );
    case 'licenses':
      return <Licenses onClose={dialogs.backToSettings} onOpenLink={onOpenLink} />;
    case 'deleteAccount':
      return (
        <DeleteAccountDialog
          jid={account.jid}
          onClose={dialogs.settingsBehind ? dialogs.backToSettings : onClose}
          onDeleted={onDeleted}
        />
      );
    default:
      return null;
  }
}
