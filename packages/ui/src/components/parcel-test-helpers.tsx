import type { Attachment, Chat, Core } from '@hey-postie/core';
import { fireEvent, screen } from '@testing-library/react';
import { vi } from 'vitest';
import { useUploads } from '../core/useUploads';
import { renderWithCore, setupCore } from '../test-utils';
import { Conversation } from './Conversation';

export const CHAT: Chat = {
  id: 'bob@example.org',
  kind: 'direct',
  peerJid: 'bob@example.org',
  title: 'bob',
  unreadCount: 0,
  encrypted: false,
};
const noop = () => {};

/** `Conversation` with the uploads store `Main` would hold above it. */
export function TestConversation({
  chat = CHAT,
  onSaveFile = noop,
}: {
  chat?: Chat;
  onSaveFile?: (blob: Blob, name: string) => void;
}) {
  const uploads = useUploads();
  return (
    <Conversation
      chat={chat}
      contact={undefined}
      room={undefined}
      detailsOpen={false}
      onToggleDetails={noop}
      onOpenEncryption={noop}
      onOpenLink={noop}
      onSaveFile={onSaveFile}
      uploads={uploads.forChat(chat.id)}
    />
  );
}

/** A direct chat with bob, on fakes (or the given core), with a spy where saved parcels go. */
export function renderConversation(
  { deps, core } = setupCore(),
  chat = CHAT,
): {
  deps: typeof deps;
  core: Core;
  onSaveFile: ReturnType<typeof vi.fn>;
  view: ReturnType<typeof renderWithCore>;
} {
  const onSaveFile = vi.fn();
  const view = renderWithCore(<TestConversation chat={chat} onSaveFile={onSaveFile} />, core);
  return { deps, core, onSaveFile, view };
}

/** Picks files through the composer's file input. */
export function attach(files: File[]) {
  const input = screen.getByLabelText('Attach a parcel', { selector: 'input' });
  fireEvent.change(input, { target: { files } });
}

/** An attachment as the fake repository would describe it. */
export function parcel(overrides: Partial<Attachment> = {}): Attachment {
  return {
    url: 'https://upload.example.org/cat.png',
    name: 'cat.png',
    size: 1234,
    mimeType: 'image/png',
    encryption: 'none',
    ...overrides,
  };
}

/** jsdom has no object URLs; the tests only check that the bytes, not the raw URL, reach the <img>. */
export function stubObjectUrls() {
  const createObjectURL = vi.fn(() => 'blob:cat');
  const revokeObjectURL = vi.fn();
  URL.createObjectURL = createObjectURL;
  URL.revokeObjectURL = revokeObjectURL;
  return { createObjectURL, revokeObjectURL };
}
