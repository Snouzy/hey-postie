import { DomainError } from '@hey-postie/core';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { App } from '../App';
import { writeWelcomed } from '../core/settings';
import { setupCore } from '../test-utils';

const HALL = 'hall@rooms.x.org';

/** Signed in, one direct chat with bob and one hall joined; the hall is the first row. */
async function withHall() {
  const { deps, core } = setupCore();
  writeWelcomed('alice@x.org'); // not a first launch: the empty state, not the welcome card
  render(<App core={core} locale="en" />);
  await act(() => core.accounts.signIn({ jid: 'alice@x.org', password: 'pw', remember: false }));
  act(() => {
    // A contact: a stranger's letter waits in the requests group, not in the chat list.
    deps.fakes.roster.seed({
      jid: 'bob@x.org',
      name: 'bob',
      presence: 'offline',
      subscription: 'both',
    });
    deps.fakes.chat.receive({ chatId: 'bob@x.org', fromJid: 'bob@x.org', body: 'hi' });
  });
  await act(() => core.rooms.join({ jid: HALL, nick: 'alice' }));
  const row = await screen.findByRole('button', { name: /hall/ });
  return { deps, core, row };
}

function openMenu() {
  fireEvent.click(screen.getByRole('button', { name: 'More' }));
  return screen.getByRole('menu', { name: 'hall' });
}

describe('Leave a hall from its row', () => {
  it('only a hall row has the "More" button', async () => {
    await withHall();
    expect(screen.getAllByRole('button', { name: 'More' })).toHaveLength(1);
    const direct = screen.getByRole('button', { name: /bob/ });
    expect(
      within(direct.parentElement as HTMLElement).queryByRole('button', { name: 'More' }),
    ).toBeNull();
  });

  it('"More" opens a menu with "Leave the hall…" and the focus on it', async () => {
    await withHall();
    const menu = openMenu();
    const item = within(menu).getByRole('menuitem', { name: 'Leave the hall…' });
    expect(item).toHaveFocus();
    expect(screen.getByRole('button', { name: 'More' })).toHaveAttribute('aria-expanded', 'true');
  });

  it('a right-click on the row opens the same menu', async () => {
    const { row } = await withHall();
    fireEvent.contextMenu(row);
    expect(screen.getByRole('menuitem', { name: 'Leave the hall…' })).toHaveFocus();
  });

  it('Esc closes the menu and gives the focus back to the row it came from', async () => {
    const { row } = await withHall();
    row.focus();
    fireEvent.contextMenu(row);
    const item = screen.getByRole('menuitem', { name: 'Leave the hall…' });
    fireEvent.keyDown(item, { key: 'Escape' });
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(row).toHaveFocus();
    // The details pane and the selection were not touched.
    expect(screen.getByText(/No letter open/)).toBeInTheDocument();
  });

  it('still opens the confirmation after a blur to nowhere (WebKit click)', async () => {
    await withHall();
    openMenu();
    const item = screen.getByRole('menuitem', { name: 'Leave the hall…' });
    fireEvent.focusOut(item, { relatedTarget: null });
    expect(screen.getByRole('menu')).toBeInTheDocument();
    fireEvent.click(item);
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
  });

  it('confirms with the hall name, leaves through the service and drops the selection', async () => {
    const { deps, row } = await withHall();
    const halls = () => screen.getByRole('region', { name: 'Halls' });
    expect(within(halls()).getAllByRole('listitem')).toHaveLength(1);
    fireEvent.click(row);
    await screen.findByRole('heading', { name: 'hall' });
    const menu = openMenu();
    fireEvent.click(within(menu).getByRole('menuitem', { name: 'Leave the hall…' }));
    const dialog = screen.getByRole('dialog', { name: 'Leave the hall' });
    expect(dialog).toHaveTextContent('Leave hall? I will forget its bookmark');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Leave' }));
    await waitFor(() => expect(deps.fakes.room.left).toEqual([HALL]));
    expect(await screen.findByText(/No letter open/)).toBeInTheDocument();
    // The hall's row is gone; the empty group offers to create one instead.
    expect(within(halls()).queryAllByRole('listitem')).toHaveLength(0);
    expect(
      within(halls()).getByRole('button', { name: 'Create your first hall' }),
    ).toBeInTheDocument();
  });

  it('Esc on the confirmation leaves nothing and puts the focus back on "More"', async () => {
    const { deps } = await withHall();
    const menu = openMenu();
    fireEvent.click(within(menu).getByRole('menuitem', { name: 'Leave the hall…' }));
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'More' })).toHaveFocus();
    expect(deps.fakes.room.left).toEqual([]);
  });

  it('a refusal keeps the confirmation open with the sentence', async () => {
    const { deps } = await withHall();
    vi.spyOn(deps.room, 'leave').mockRejectedValue(new DomainError('ServerUnreachable'));
    const menu = openMenu();
    fireEvent.click(within(menu).getByRole('menuitem', { name: 'Leave the hall…' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Leave' }));
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'Leave the hall' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /hall/ })).toBeInTheDocument();
  });

  it('arrow keys move between rows and skip the "More" button', async () => {
    const { row } = await withHall();
    row.focus();
    fireEvent.keyDown(row, { key: 'ArrowDown' });
    expect(screen.getByRole('button', { name: /bob/ })).toHaveFocus();
  });
});
