import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { CoreProvider } from '../core/CoreProvider';
import { clearDrafts, readDraft } from '../core/drafts';
import { setupCore } from '../test-utils';
import { Composer } from './Composer';

type Props = Partial<ComponentProps<typeof Composer>> & { chatId: string };

/** `Conversation` is keyed by chat: a switch mounts a fresh composer, as `key` does here. */
function setup() {
  const { core } = setupCore();
  const onSend = vi.fn(async () => {});
  const ui = (props: Props) => (
    <CoreProvider core={core} locale="en">
      <Composer key={props.chatId} onSend={onSend} {...props} />
    </CoreProvider>
  );
  const view = render(ui({ chatId: 'bob@x.org' }));
  return { onSend, show: (props: Props) => view.rerender(ui(props)) };
}

const field = () => screen.getByRole('textbox');

describe('Composer: a draft per chat', () => {
  it('keeps what was typed when the user goes to another chat and comes back', () => {
    const { show } = setup();
    fireEvent.change(field(), { target: { value: 'Half a letter' } });
    show({ chatId: 'ann@x.org' });
    expect(field()).toHaveValue('');
    fireEvent.change(field(), { target: { value: 'For Ann' } });
    show({ chatId: 'bob@x.org' });
    expect(field()).toHaveValue('Half a letter');
    show({ chatId: 'ann@x.org' });
    expect(field()).toHaveValue('For Ann');
  });

  it('forgets the draft once the letter is sent', async () => {
    const { onSend, show } = setup();
    fireEvent.change(field(), { target: { value: 'Hello' } });
    fireEvent.keyDown(field(), { key: 'Enter' });
    expect(onSend).toHaveBeenCalledWith('Hello');
    await waitFor(() => expect(field()).toHaveValue(''));
    show({ chatId: 'ann@x.org' });
    show({ chatId: 'bob@x.org' });
    expect(field()).toHaveValue('');
    expect(readDraft('bob@x.org')).toBe('');
  });

  it('gives the draft back after a correction, which never becomes the draft', async () => {
    const { show } = setup();
    fireEvent.change(field(), { target: { value: 'Not done yet' } });
    const editing = { id: 'm1', body: 'Helo' };
    show({ chatId: 'bob@x.org', editing, onCancelEdit: () => show({ chatId: 'bob@x.org' }) });
    await waitFor(() => expect(field()).toHaveValue('Helo'));
    fireEvent.change(field(), { target: { value: 'Hello' } });
    expect(readDraft('bob@x.org')).toBe('Not done yet');
    fireEvent.keyDown(field(), { key: 'Escape' });
    expect(field()).toHaveValue('Not done yet');
  });

  it('keeps Claude’s draft in the chat’s draft during a correction', async () => {
    const { show } = setup();
    const editing = { id: 'm1', body: 'Helo' };
    show({ chatId: 'bob@x.org', editing });
    await waitFor(() => expect(field()).toHaveValue('Helo'));
    show({ chatId: 'bob@x.org', editing, draft: 'On my way', onDraftTaken: () => {} });
    expect(field()).toHaveValue('Helo');
    expect(readDraft('bob@x.org')).toBe('On my way');
  });

  it('forgets every draft on sign-out', () => {
    setup();
    fireEvent.change(field(), { target: { value: 'Secret' } });
    clearDrafts();
    expect(readDraft('bob@x.org')).toBe('');
  });
});
