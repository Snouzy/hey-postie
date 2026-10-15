import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithCore, setupCore } from '../test-utils';
import { AccountMenu } from './AccountMenu';

function openMenu() {
  const { core } = setupCore();
  const onSignOut = vi.fn();
  const onMyDevices = vi.fn();
  const onDeleteAccount = vi.fn();
  renderWithCore(
    <AccountMenu
      account={{ jid: 'alice@x.org', displayName: 'alice', state: 'online' }}
      onSignOut={onSignOut}
      onMyDevices={onMyDevices}
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
});
