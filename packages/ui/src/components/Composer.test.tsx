import { DomainError } from '@hey-postie/core';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithCore, setupCore } from '../test-utils';
import { Composer } from './Composer';

function renderComposer(onSend = vi.fn(async () => {})) {
  const { core } = setupCore();
  const onComposing = vi.fn();
  renderWithCore(<Composer onSend={onSend} onComposing={onComposing} />, core);
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
});
