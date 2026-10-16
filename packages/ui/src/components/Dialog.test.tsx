import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { CoreProvider } from '../core/CoreProvider';
import { setupCore } from '../test-utils';
import { Dialog } from './Dialog';

function Harness({ closable = true }: { closable?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        opener
      </button>
      {open && (
        <Dialog title="A question" onClose={() => setOpen(false)} closable={closable}>
          <input aria-label="first" />
          <button type="button">last</button>
        </Dialog>
      )}
    </>
  );
}

function openDialog(closable = true) {
  const { core } = setupCore();
  render(
    <CoreProvider core={core} locale="en">
      <Harness closable={closable} />
    </CoreProvider>,
  );
  const opener = screen.getByRole('button', { name: 'opener' });
  opener.focus();
  fireEvent.click(opener);
  return opener;
}

describe('Dialog', () => {
  it('puts the focus in the first field', () => {
    openDialog();
    expect(screen.getByLabelText('first')).toHaveFocus();
  });

  it('cycles Tab inside the card, both ways', () => {
    openDialog();
    const dialog = screen.getByRole('dialog');
    const last = screen.getByRole('button', { name: 'last' });
    last.focus();
    fireEvent.keyDown(dialog, { key: 'Tab' });
    expect(screen.getByRole('button', { name: 'Close' })).toHaveFocus();
    fireEvent.keyDown(dialog, { key: 'Tab', shiftKey: true });
    expect(last).toHaveFocus();
  });

  it('ignores Esc and disables the X while not closable', () => {
    openDialog(false);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Close' })).toBeDisabled();
  });

  it('gives the focus back to the opener on Esc', () => {
    const opener = openDialog();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
  });

  it('makes everything outside the card inert while open, and frees it on close', () => {
    const opener = openDialog();
    expect(opener).toHaveAttribute('inert');
    expect(screen.getByRole('dialog')).not.toHaveAttribute('inert');
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(opener).not.toHaveAttribute('inert');
  });
});
