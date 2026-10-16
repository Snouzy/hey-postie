import { DomainError, type FakeDependencies } from '@hey-postie/core';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { App } from '../App';
import { writeWelcomed } from '../core/settings';
import { setupCore } from '../test-utils';

const HALL = 'stamps@rooms.x.org';

async function signedIn(before: (deps: FakeDependencies) => void = () => {}) {
  const { deps, core } = setupCore();
  writeWelcomed('alice@x.org');
  deps.fakes.room.services.set('x.org', 'rooms.x.org');
  deps.fakes.roster.seed(
    { jid: 'bob@x.org', name: 'Bob', presence: 'online', subscription: 'both' },
    { jid: 'anna@y.org', name: 'Anna', presence: 'offline', subscription: 'both' },
  );
  before(deps);
  render(<App core={core} locale="en" />);
  await act(() => core.accounts.signIn({ jid: 'alice@x.org', password: 'pw', remember: false }));
  return { deps, core };
}

function openDialog() {
  fireEvent.click(screen.getByRole('button', { name: 'Add' }));
  fireEvent.click(screen.getByRole('menuitem', { name: 'New chat' }));
  const dialog = screen.getByRole('dialog', { name: 'New chat' });
  return { dialog, field: within(dialog).getByRole('combobox', { name: 'Name or address' }) };
}

const type = (field: HTMLElement, value: string) => fireEvent.change(field, { target: { value } });

describe('NewChat', () => {
  it('lists the address book and the halls, the field focused, no address row', async () => {
    const { core } = await signedIn();
    await act(() => core.rooms.join({ jid: HALL, nick: 'alice' }));
    const { dialog, field } = openDialog();
    expect(field).toHaveFocus();
    expect(within(dialog).getByRole('heading', { name: 'Address book' })).toBeInTheDocument();
    expect(within(dialog).getByRole('heading', { name: 'Halls' })).toBeInTheDocument();
    const options = within(dialog).getAllByRole('option');
    expect(options.map((o) => o.textContent)).toEqual([
      expect.stringContaining('Bob'),
      expect.stringContaining('Anna'),
      expect.stringContaining('stamps'),
    ]);
    expect(within(dialog).queryByText(/Write to/)).not.toBeInTheDocument();
  });

  it('filters both groups and ends with the typed text as an address', async () => {
    const { core } = await signedIn();
    await act(() => core.rooms.join({ jid: HALL, nick: 'alice' }));
    const { dialog, field } = openDialog();
    type(field, 'an');
    const options = within(dialog).getAllByRole('option');
    expect(options).toHaveLength(2);
    expect(options[0]).toHaveTextContent('Anna');
    expect(options[1]).toHaveTextContent('Write to an');
    expect(within(dialog).queryByRole('heading', { name: 'Halls' })).not.toBeInTheDocument();
    type(field, 'stamp');
    expect(within(dialog).getAllByRole('option')[0]).toHaveTextContent('stamps');
  });

  it('opens the chat of the contact picked with the arrows and Enter', async () => {
    const { dialog, field } = await signedIn().then(() => openDialog());
    expect(field).toHaveAttribute(
      'aria-activedescendant',
      within(dialog).getAllByRole('option')[0]?.id,
    );
    fireEvent.keyDown(field, { key: 'ArrowDown' });
    const anna = within(dialog).getAllByRole('option')[1];
    expect(anna).toHaveAttribute('aria-selected', 'true');
    expect(field).toHaveAttribute('aria-activedescendant', anna?.id);
    fireEvent.keyDown(field, { key: 'Enter' });
    expect(await screen.findByRole('heading', { name: 'anna' })).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('opens a chat on a click on a contact', async () => {
    const { dialog } = await signedIn().then(() => openDialog());
    fireEvent.click(within(dialog).getByRole('option', { name: /Bob/ }));
    expect(await screen.findByRole('heading', { name: 'bob' })).toBeInTheDocument();
  });

  it('joins a bookmarked hall with its nick and selects it', async () => {
    const { deps, core } = await signedIn();
    await act(() => core.rooms.join({ jid: HALL, nick: 'alice' }));
    const [room] = await core.rooms.list();
    if (!room) throw new Error('no room');
    await act(async () => {
      deps.fakes.room.change({ ...room, joined: false, bookmarked: true, nick: 'ali' });
    });
    const { field } = openDialog();
    type(field, 'stamps');
    fireEvent.keyDown(field, { key: 'Enter' });
    expect(await screen.findByRole('heading', { name: 'stamps' })).toBeInTheDocument();
    expect(deps.fakes.room.joined).toEqual([HALL, HALL]);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('joins a typed address on the conference service, with the account name as nick', async () => {
    const { deps } = await signedIn();
    const { dialog, field } = openDialog();
    type(field, 'Bikes@rooms.x.org');
    await within(dialog).findByRole('option', { name: 'Join the hall Bikes@rooms.x.org' });
    fireEvent.keyDown(field, { key: 'Enter' });
    expect(await screen.findByRole('heading', { name: 'bikes' })).toBeInTheDocument();
    expect(deps.fakes.room.joined).toEqual(['bikes@rooms.x.org']);
  });

  it('keeps the card with the sentence when the hall refuses', async () => {
    await signedIn((deps) =>
      deps.fakes.room.refusals.set('locked@rooms.x.org', new DomainError('RoomPasswordRequired')),
    );
    const { dialog, field } = openDialog();
    type(field, 'locked@rooms.x.org');
    await within(dialog).findByRole('option', { name: /Join the hall/ });
    fireEvent.keyDown(field, { key: 'Enter' });
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('This hall is locked.');
    expect(field).toHaveAttribute('aria-invalid', 'true');
  });

  it('writes to a typed user address', async () => {
    const { dialog, field } = await signedIn().then(() => openDialog());
    type(field, 'Carol@x.org');
    fireEvent.click(within(dialog).getByRole('option', { name: 'Write to Carol@x.org' }));
    expect(await screen.findByRole('heading', { name: 'carol' })).toBeInTheDocument();
  });

  it('says nobody matches and marks the field when the text is not an address', async () => {
    const { dialog, field } = await signedIn().then(() => openDialog());
    type(field, 'nope');
    expect(within(dialog).getByText(/I know nobody by that name/)).toBeInTheDocument();
    expect(within(dialog).getByRole('option', { name: 'Write to nope' })).toBeInTheDocument();
    fireEvent.keyDown(field, { key: 'Enter' });
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'That address does not look right.',
    );
    expect(field).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('closes on Esc', async () => {
    const { dialog, field } = await signedIn().then(() => openDialog());
    fireEvent.keyDown(field, { key: 'Escape' });
    expect(dialog).not.toBeInTheDocument();
  });
});
