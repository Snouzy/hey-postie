import { act, fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useAccount } from '../core/useAccount';
import { renderWithCore, setupCore } from '../test-utils';
import { AccountMenu } from './AccountMenu';

function openMenu(state: 'online' | 'offline' = 'online') {
  const { core } = setupCore();
  const onSignOut = vi.fn();
  const onMyDevices = vi.fn();
  const onDeleteAccount = vi.fn();
  renderWithCore(
    <AccountMenu
      account={{ jid: 'alice@x.org', displayName: 'alice', state }}
      onSignOut={onSignOut}
      onMyDevices={onMyDevices}
      onSettings={() => {}}
      onDeleteAccount={onDeleteAccount}
    />,
    core,
  );
  const trigger = screen.getByRole('button', { name: 'alice' });
  fireEvent.click(trigger);
  return { trigger, onSignOut, onMyDevices, onDeleteAccount };
}

describe('AccountMenu', () => {
  it('opens on the account row, shows the JID beside the menu and focuses the first item', () => {
    const { trigger } = openMenu();
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('alice@x.org')).toBeInTheDocument();
    expect(screen.getByRole('menu')).not.toHaveTextContent('alice@x.org');
    expect(screen.getByRole('menuitem', { name: 'Sign out' })).toHaveFocus();
  });

  it('goes to the last item on ArrowUp from outside the items', () => {
    openMenu();
    const menu = screen.getByRole('menu');
    menu.focus();
    (document.activeElement as HTMLElement | null)?.blur();
    fireEvent.keyDown(menu, { key: 'ArrowUp' });
    expect(screen.getByRole('menuitem', { name: 'Delete my account…' })).toHaveFocus();
  });

  it('closes when the focus leaves it with Tab', () => {
    openMenu();
    fireEvent.focusOut(screen.getByRole('menuitem', { name: 'Sign out' }), {
      relatedTarget: document.body,
    });
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('still acts on a click after a blur to nowhere (WebKit does not focus buttons on mousedown)', () => {
    const { onDeleteAccount } = openMenu();
    const item = screen.getByRole('menuitem', { name: 'Delete my account…' });
    fireEvent.focusOut(item, { relatedTarget: null });
    expect(screen.getByRole('menu')).toBeInTheDocument();
    fireEvent.click(item);
    expect(onDeleteAccount).toHaveBeenCalledOnce();
  });

  it('puts the focus back on the row before acting, so a dialog returns there', () => {
    const { trigger, onDeleteAccount } = openMenu();
    onDeleteAccount.mockImplementation(() => expect(trigger).toHaveFocus());
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete my account…' }));
    expect(onDeleteAccount).toHaveBeenCalledOnce();
    expect(trigger).toHaveFocus();
  });

  it('moves between items with the arrows and wraps around', () => {
    openMenu();
    const menu = screen.getByRole('menu');
    fireEvent.keyDown(menu, { key: 'ArrowDown' });
    expect(screen.getByRole('menuitem', { name: 'My devices…' })).toHaveFocus();
    fireEvent.keyDown(menu, { key: 'ArrowDown' });
    expect(screen.getByRole('menuitem', { name: 'Settings…' })).toHaveFocus();
    fireEvent.keyDown(menu, { key: 'ArrowDown' });
    expect(screen.getByRole('menuitem', { name: 'Delete my account…' })).toHaveFocus();
    fireEvent.keyDown(menu, { key: 'ArrowDown' });
    expect(screen.getByRole('menuitem', { name: 'Sign out' })).toHaveFocus();
    fireEvent.keyDown(menu, { key: 'ArrowUp' });
    expect(screen.getByRole('menuitem', { name: 'Delete my account…' })).toHaveFocus();
  });

  it('closes on Esc and gives the focus back to the row', () => {
    const { trigger } = openMenu();
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' });
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it('closes on a click outside', () => {
    openMenu();
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('hands the three actions to its owner and closes', () => {
    const { onSignOut, onMyDevices, onDeleteAccount } = openMenu();
    fireEvent.click(screen.getByRole('menuitem', { name: 'My devices…' }));
    expect(onMyDevices).toHaveBeenCalledOnce();
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'alice' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete my account…' }));
    expect(onDeleteAccount).toHaveBeenCalledOnce();
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'alice' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Sign out' }));
    expect(onSignOut).toHaveBeenCalledOnce();
  });

  /** The row as the sidebar mounts it: fed by `useAccount`, so a new presence reaches it. */
  function Row() {
    const account = useAccount();
    if (!account) return null;
    return (
      <AccountMenu
        account={account}
        onSignOut={() => {}}
        onMyDevices={() => {}}
        onSettings={() => {}}
        onDeleteAccount={() => {}}
      />
    );
  }

  /** A signed-in account, so the service accepts a presence. */
  async function openOnline() {
    const { deps, core } = setupCore();
    await core.accounts.signIn({ jid: 'alice@x.org', password: 'pw', remember: false });
    renderWithCore(<Row />, core);
    fireEvent.click(screen.getByRole('button', { name: 'alice' }));
    return { deps, core };
  }

  it('sends the chosen presence with the status sentence', async () => {
    const { deps } = await openOnline();
    expect(screen.getByRole('radio', { name: /Available/ })).toBeChecked();
    await act(() => fireEvent.click(screen.getByRole('radio', { name: /Away/ })));
    expect(deps.fakes.xmpp.presences.at(-1)).toEqual({ show: 'away' });
    const status = screen.getByRole('textbox', { name: 'Status' });
    fireEvent.change(status, { target: { value: ' On the road ' } });
    expect(screen.getByText('13/140')).toBeInTheDocument();
    await act(() => fireEvent.keyDown(status, { key: 'Enter' }));
    expect(deps.fakes.xmpp.presences.at(-1)).toEqual({ show: 'away', status: 'On the road' });
  });

  it("shows Postie's sentence when the status is too long, and the counter in the red", async () => {
    const { deps } = await openOnline();
    const status = screen.getByRole('textbox', { name: 'Status' });
    fireEvent.change(status, { target: { value: 'x'.repeat(141) } });
    expect(screen.getByText('141/140')).toHaveAttribute('data-over');
    await act(() => fireEvent.keyDown(status, { key: 'Enter' }));
    expect(screen.getByRole('alert')).toHaveTextContent('too long');
    expect(deps.fakes.xmpp.presences).toHaveLength(0);
  });

  it('keeps the picker off while the account is not online', () => {
    openMenu('offline');
    expect(screen.getByRole('radio', { name: /Available/ })).toBeDisabled();
    expect(screen.getByRole('textbox', { name: 'Status' })).toBeDisabled();
  });

  it('closes on Esc from the status field too, with the focus back on the row', () => {
    const { trigger } = openMenu();
    const status = screen.getByRole('textbox', { name: 'Status' });
    status.focus();
    fireEvent.keyDown(status, { key: 'Escape' });
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });
});
