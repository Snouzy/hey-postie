import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { App } from '../App';
import { setupCore } from '../test-utils';

/** Signs in, then reaches the dialog the way a user does: account row, then the menu entry. */
async function openDialog() {
  const { deps, core } = setupCore();
  render(<App core={core} locale="en" />);
  await act(() => core.accounts.signIn({ jid: 'alice@x.org', password: 'pw', remember: false }));
  fireEvent.click(screen.getByRole('button', { name: 'alice' }));
  fireEvent.click(screen.getByRole('menuitem', { name: 'Delete my account…' }));
  return { deps, core, button: screen.getByRole('button', { name: 'Delete for good' }) };
}

describe('DeleteAccountDialog', () => {
  it('is two clicks away, explains, and keeps the button asleep until the JID is typed', async () => {
    const { button } = await openDialog();
    expect(screen.getByRole('dialog', { name: 'Delete my account' })).toBeInTheDocument();
    const confirm = screen.getByLabelText('Type your address to confirm');
    expect(confirm).toHaveAccessibleDescription(/for good/);
    expect(confirm).toHaveFocus();
    expect(button).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Type your address to confirm'), {
      target: { value: 'alice@x.or' },
    });
    expect(button).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Type your address to confirm'), {
      target: { value: ' Alice@x.org ' },
    });
    expect(button).toBeEnabled();
  });

  it('deletes the account on the server and goes back to the welcome screen', async () => {
    const { deps, button } = await openDialog();
    deps.fakes.registration.currentJid = 'alice@x.org';
    fireEvent.change(screen.getByLabelText('Type your address to confirm'), {
      target: { value: 'alice@x.org' },
    });
    fireEvent.click(button);
    expect(await screen.findByRole('button', { name: 'Create an account' })).toBeInTheDocument();
    expect(deps.fakes.registration.deleted).toEqual(['alice@x.org']);
    expect(deps.fakes.registration.wiped).toEqual(['alice@x.org']);
  });

  it('says what went wrong and stays open when the server refuses', async () => {
    const { button } = await openDialog();
    // The fake has no current JID: deleteCurrent throws.
    fireEvent.change(screen.getByLabelText('Type your address to confirm'), {
      target: { value: 'alice@x.org' },
    });
    fireEvent.click(button);
    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    await waitFor(() => expect(button).toBeEnabled());
  });

  it('closes on Esc without deleting anything', async () => {
    const { deps } = await openDialog();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(deps.fakes.registration.deleted).toEqual([]);
    expect(screen.getByRole('searchbox', { name: 'Search chats' })).toBeInTheDocument();
  });
});
