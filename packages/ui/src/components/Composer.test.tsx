import { DomainError } from '@hey-postie/core';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CoreProvider } from '../core/CoreProvider';
import { renderWithCore, setupCore } from '../test-utils';
import { Composer } from './Composer';

function renderComposer(onSend = vi.fn(async () => {})) {
  const { core } = setupCore();
  const onComposing = vi.fn();
  renderWithCore(<Composer chatId="bob@x.org" onSend={onSend} onComposing={onComposing} />, core);
  const area = screen.getByRole('textbox');
  return { onSend, onComposing, area };
}

describe('Composer', () => {
  it('disables sending while the text is empty', () => {
    const { area } = renderComposer();
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
    fireEvent.change(area, { target: { value: '   ' } });
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
  });

  it('sends the trimmed text on Enter and clears the field', async () => {
    const { onSend, area } = renderComposer();
    fireEvent.change(area, { target: { value: '  hello  ' } });
    fireEvent.keyDown(area, { key: 'Enter' });
    expect(onSend).toHaveBeenCalledWith('hello');
    await waitFor(() => expect(area).toHaveValue(''));
  });

  it('does not send while an IME is composing', () => {
    const { onSend, area } = renderComposer();
    fireEvent.change(area, { target: { value: '日本' } });
    fireEvent.keyDown(area, { key: 'Enter', isComposing: true });
    expect(onSend).not.toHaveBeenCalled();
  });

  it('does not send on Shift+Enter', () => {
    const { onSend, area } = renderComposer();
    fireEvent.change(area, { target: { value: 'line one' } });
    fireEvent.keyDown(area, { key: 'Enter', shiftKey: true });
    expect(onSend).not.toHaveBeenCalled();
  });

  it('focuses the text again after a send without scrolling anything', async () => {
    const focus = vi.spyOn(HTMLElement.prototype, 'focus');
    const { area } = renderComposer();
    fireEvent.change(area, { target: { value: 'hello' } });
    fireEvent.keyDown(area, { key: 'Enter' });
    await waitFor(() => expect(area).toHaveValue(''));
    // The textarea is on screen already: the browser must not scroll an ancestor to show it.
    expect(focus).toHaveBeenLastCalledWith({ preventScroll: true });
    focus.mockRestore();
  });

  it('shows the error from the service inline and keeps the text', async () => {
    const onSend = vi.fn(async () => {
      throw new DomainError('Unknown');
    });
    const { area } = renderComposer(onSend);
    fireEvent.change(area, { target: { value: 'hello' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong on my round.');
    expect(area).toHaveValue('hello');
  });

  it('says it is composing on input, and not any more once the draft is empty or sent', async () => {
    const { onComposing, area } = renderComposer();
    fireEvent.change(area, { target: { value: 'hel' } });
    expect(onComposing).toHaveBeenLastCalledWith(true);
    fireEvent.change(area, { target: { value: '' } });
    expect(onComposing).toHaveBeenLastCalledWith(false);
    fireEvent.change(area, { target: { value: 'hello' } });
    expect(onComposing).toHaveBeenLastCalledWith(true);
    fireEvent.keyDown(area, { key: 'Enter' });
    await waitFor(() => expect(area).toHaveValue(''));
    expect(onComposing).toHaveBeenLastCalledWith(false);
  });

  it('keeps the file input out of the Tab order: the paperclip is the one stop', () => {
    const { core } = setupCore();
    renderWithCore(
      <Composer chatId="bob@x.org" onSend={vi.fn(async () => {})} onAttach={vi.fn()} />,
      core,
    );
    const [input, button] = screen.getAllByLabelText('Attach a parcel');
    expect(input).toHaveAttribute('type', 'file');
    expect(input).toHaveAttribute('tabindex', '-1');
    expect(button).toHaveAttribute('type', 'button');
    expect(button).not.toHaveAttribute('tabindex');
  });
});

describe('Composer drafts', () => {
  it('puts Claude’s draft below what the user wrote, and sends nothing on its own', async () => {
    const { core } = setupCore();
    const onSend = vi.fn(async () => {});
    const onDraftTaken = vi.fn();
    const { rerender } = renderWithCore(<Composer chatId="bob@x.org" onSend={onSend} />, core);
    const area = screen.getByRole('textbox');
    fireEvent.change(area, { target: { value: 'Hi Bob,' } });
    rerender(
      <CoreProvider core={core} locale="en">
        <Composer
          chatId="bob@x.org"
          onSend={onSend}
          draft="On my way"
          onDraftTaken={onDraftTaken}
        />
      </CoreProvider>,
    );
    expect(area).toHaveValue('Hi Bob,\nOn my way');
    expect(onDraftTaken).toHaveBeenCalledTimes(1);
    expect(onSend).not.toHaveBeenCalled();
  });
});

describe('Composer editing', () => {
  it('fills the field with the letter, and Esc cancels', () => {
    const { core } = setupCore();
    const onCancelEdit = vi.fn();
    renderWithCore(
      <Composer
        chatId="bob@x.org"
        onSend={vi.fn(async () => {})}
        editing={{ id: 'm1', body: 'Helo' }}
        onCancelEdit={onCancelEdit}
      />,
      core,
    );
    const area = screen.getByRole('textbox');
    expect(area).toHaveValue('Helo');
    expect(screen.getByText(/Editing a letter/)).toBeInTheDocument();
    fireEvent.keyDown(area, { key: 'Escape' });
    expect(onCancelEdit).toHaveBeenCalled();
    expect(area).toHaveValue('');
  });

  it('asks for my last letter on ↑ in an empty field', () => {
    const { core } = setupCore();
    const onEditLast = vi.fn();
    renderWithCore(
      <Composer chatId="bob@x.org" onSend={vi.fn(async () => {})} onEditLast={onEditLast} />,
      core,
    );
    const area = screen.getByRole('textbox');
    fireEvent.keyDown(area, { key: 'ArrowUp' });
    expect(onEditLast).toHaveBeenCalledTimes(1);
    fireEvent.change(area, { target: { value: 'typing' } });
    fireEvent.keyDown(area, { key: 'ArrowUp' });
    expect(onEditLast).toHaveBeenCalledTimes(1);
  });
});
