import { DomainError, type FakeDependencies } from '@hey-postie/core';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { App } from '../App';
import { writeWelcomed } from '../core/settings';
import { setupCore } from '../test-utils';

const HALL = 'hall@rooms.x.org';

async function signedIn(before: (deps: FakeDependencies) => void = () => {}) {
  const { deps, core } = setupCore();
  writeWelcomed('alice@x.org'); // not a first launch: the empty state, not the welcome card
  before(deps);
  render(<App core={core} locale="en" />);
  await act(() => core.accounts.signIn({ jid: 'alice@x.org', password: 'pw', remember: false }));
  return { deps, core };
}

function openJoinDialog() {
  fireEvent.click(screen.getByRole('button', { name: 'Add' }));
  fireEvent.click(screen.getByRole('menuitem', { name: 'Join a room' }));
  return screen.getByRole('dialog', { name: 'Join a room' });
}

/** The members pane shows the list once the service answered; closes it again. */
async function membersLoaded() {
  fireEvent.click(screen.getByRole('button', { name: 'Members' }));
  await screen.findByRole('heading', { name: 'Moderators' });
  fireEvent.click(screen.getByRole('button', { name: 'Close details' }));
}

/** Joins the hall through the service and opens it from the sidebar. */
async function inHall(deps: FakeDependencies, core: ReturnType<typeof setupCore>['core']) {
  await act(() => core.rooms.join({ jid: HALL, nick: 'alice' }));
  act(() => {
    deps.fakes.room.setMembers(HALL, [
      { nick: 'alice', role: 'participant', affiliation: 'member' },
      { nick: 'bob', role: 'moderator', affiliation: 'owner' },
      { nick: 'brenda', role: 'visitor', affiliation: 'none' },
      { nick: 'Bo', role: 'participant', affiliation: 'none' },
    ]);
  });
  fireEvent.click(await screen.findByRole('button', { name: /hall/ }));
  return screen.getByRole('region', { name: 'hall' });
}

describe('Join a room', () => {
  it('prefills the nick, joins by address and selects the hall', async () => {
    const { deps } = await signedIn();
    const dialog = openJoinDialog();
    expect(within(dialog).getByLabelText('Nickname')).toHaveValue('alice');
    fireEvent.change(within(dialog).getByLabelText('Room address'), { target: { value: HALL } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Join' }));
    await waitFor(() => expect(dialog).not.toBeInTheDocument());
    expect(deps.fakes.room.joined).toEqual([HALL]);
    expect(await screen.findByRole('heading', { name: 'hall' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Members' })).toBeInTheDocument();
  });

  it('reveals the password field when the hall is locked', async () => {
    await signedIn((deps) =>
      deps.fakes.room.refusals.set(HALL, new DomainError('RoomPasswordRequired')),
    );
    const dialog = openJoinDialog();
    expect(within(dialog).queryByLabelText('Password')).not.toBeInTheDocument();
    fireEvent.change(within(dialog).getByLabelText('Room address'), { target: { value: HALL } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Join' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('This hall is locked.');
    expect(within(dialog).getByLabelText('Password')).toBeInTheDocument();
  });

  it('says the sentence when the nick is taken', async () => {
    await signedIn((deps) => deps.fakes.room.refusals.set(HALL, new DomainError('NickTaken')));
    const dialog = openJoinDialog();
    fireEvent.change(within(dialog).getByLabelText('Room address'), { target: { value: HALL } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Join' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'already goes by that nickname',
    );
  });

  it('gives the focus back to "+" when the dialog closes', async () => {
    await signedIn();
    const dialog = openJoinDialog();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(screen.getByRole('button', { name: 'Add' })).toHaveFocus();
  });

  it('asks the server where its halls are before browsing', async () => {
    await signedIn((deps) => deps.fakes.room.services.set('x.org', 'conference.x.org'));
    const dialog = openJoinDialog();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Browse' }));
    await waitFor(() =>
      expect(within(dialog).getByLabelText('Server')).toHaveValue('conference.x.org'),
    );
  });

  it('says it in its own words when the server name is not one', async () => {
    await signedIn();
    const dialog = openJoinDialog();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Browse' }));
    fireEvent.change(within(dialog).getByLabelText('Server'), { target: { value: 'not a!' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Look up' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('server name');
  });

  it('browses the published halls and fills the address on click', async () => {
    await signedIn((deps) =>
      deps.fakes.room.publish('rooms.x.org', [{ jid: HALL, name: 'The Hall', membersCount: 3 }]),
    );
    const dialog = openJoinDialog();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Browse' }));
    expect(within(dialog).getByLabelText('Server')).toHaveValue('rooms.x.org');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Look up' }));
    const row = await within(dialog).findByRole('button', { name: /The Hall/ });
    expect(within(row).getByText('3 members')).toBeInTheDocument();
    fireEvent.click(row);
    expect(within(dialog).getByLabelText('Room address')).toHaveValue(HALL);
  });
});

describe('A hall', () => {
  it('shows the sender nick and highlights a mention', async () => {
    const { deps, core } = await signedIn();
    const region = await inHall(deps, core);
    act(() => {
      deps.fakes.chat.receive({
        chatId: HALL,
        kind: 'room',
        fromJid: `${HALL}/bob`,
        fromNick: 'bob',
        body: 'hi',
      });
      deps.fakes.chat.receive({
        chatId: HALL,
        fromJid: `${HALL}/bob`,
        fromNick: 'bob',
        body: 'alice: look',
        isMention: true,
      });
    });
    expect(await within(region).findByText('bob')).toBeInTheDocument();
    const mention = within(region).getByText('Mentions you').parentElement;
    expect(mention).toHaveTextContent('alice: look');
    expect(within(region).getByText('hi').parentElement).not.toHaveTextContent('Mentions you');
  });

  it('completes a nick with Tab and leaves the caret after it', async () => {
    const { deps, core } = await signedIn();
    const region = await inHall(deps, core);
    await membersLoaded();
    const area = within(region).getByRole('textbox', { name: /Write/ }) as HTMLTextAreaElement;
    // The exact nick (Bo) wins over the one that starts the same way (bob), whatever the case.
    fireEvent.change(area, { target: { value: 'hello bo' } });
    fireEvent.keyDown(area, { key: 'Tab' });
    expect(area).toHaveValue('hello Bo ');
    await waitFor(() => expect(area.selectionStart).toBe('hello Bo '.length));

    // At the start of a line, and no second space when one follows the caret.
    fireEvent.change(area, { target: { value: 'Bre x' } });
    area.setSelectionRange(3, 3);
    fireEvent.keyDown(area, { key: 'Tab' });
    expect(area).toHaveValue('brenda: x');
    fireEvent.change(area, { target: { value: 'see b' } });
    fireEvent.keyDown(area, { key: 'Tab' });
    expect(area).toHaveValue('see bob ');
  });

  it('stands at the door of a hall the user is not in, and joins again', async () => {
    const { deps, core } = await signedIn();
    await act(() => core.rooms.join({ jid: HALL, nick: 'alice' }));
    const [room] = await core.rooms.list();
    if (!room) throw new Error('no room');
    act(() => deps.fakes.room.change({ ...room, joined: false, bookmarked: true }));
    fireEvent.click(await screen.findByRole('button', { name: /hall/ }));
    expect(await screen.findByRole('status')).toHaveTextContent('I am not in this hall');
    expect(screen.getByRole('textbox', { name: /Write/ })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Join again' }));
    await waitFor(() => expect(deps.fakes.room.joined).toEqual([HALL, HALL]));
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: /Write/ })).toBeEnabled();
  });

  it('shows a neutral state, not the contact pane, for a hall without a record', async () => {
    const { deps } = await signedIn();
    act(() => {
      deps.fakes.chat.receive({ chatId: HALL, kind: 'room', fromJid: `${HALL}/bob`, body: 'old' });
    });
    fireEvent.click(await screen.findByRole('button', { name: /hall/ }));
    expect(await screen.findByRole('status')).toHaveTextContent('I am not in this hall');
    expect(screen.queryByRole('button', { name: 'Join again' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Details' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Members' })).not.toBeInTheDocument();
    expect(screen.queryByText('Remove contact')).not.toBeInTheDocument();
  });

  it('shows the topic, the members by role and sets the notify rule', async () => {
    const { deps, core } = await signedIn();
    const region = await inHall(deps, core);
    const [room] = await core.rooms.list();
    if (!room) throw new Error('no room');
    act(() => deps.fakes.room.change({ ...room, topic: 'Letters and stamps' }));
    expect(await within(region).findByTitle('Letters and stamps')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Members' }));
    const pane = screen.getByRole('complementary', { name: 'Members' });
    // The Encryption heading is there at once; the role headings wait for the members.
    await within(pane).findByRole('heading', { level: 3, name: 'Visitors' });
    const headings = within(pane).getAllByRole('heading', { level: 3 });
    expect(headings.map((h) => h.textContent)).toEqual([
      'Moderators',
      'Participants',
      'Visitors',
      'Encryption',
    ]);
    expect(within(pane).getByText('Letters and stamps')).toBeInTheDocument();
    expect(within(pane).getByText('owner')).toBeInTheDocument();
    expect(within(pane).getByRole('radio', { name: 'Mentions only' })).toBeChecked();
    fireEvent.click(within(pane).getByRole('radio', { name: 'All messages' }));
    await waitFor(() =>
      expect(within(pane).getByRole('radio', { name: 'All messages' })).toBeChecked(),
    );
    expect((await core.rooms.list())[0]?.notify).toBe('all');
  });

  it('Esc closes the leave confirmation but keeps the pane', async () => {
    const { deps, core } = await signedIn();
    await inHall(deps, core);
    fireEvent.click(screen.getByRole('button', { name: 'Members' }));
    fireEvent.click(screen.getByRole('button', { name: 'Leave the hall' }));
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('complementary', { name: 'Members' })).toBeInTheDocument();
  });

  it('leaves after confirmation and goes back to the empty state', async () => {
    const { deps, core } = await signedIn();
    await inHall(deps, core);
    fireEvent.click(screen.getByRole('button', { name: 'Members' }));
    fireEvent.click(screen.getByRole('button', { name: 'Leave the hall' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Leave' }));
    await waitFor(() => expect(deps.fakes.room.left).toEqual([HALL]));
    expect(await screen.findByText(/No letter open/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /hall/ })).not.toBeInTheDocument();
  });

  it('puts a freshly joined hall at the top of the list', async () => {
    const { deps, core } = await signedIn();
    act(() => {
      deps.fakes.chat.receive({ chatId: 'bob@x.org', fromJid: 'bob@x.org', body: 'hi' });
    });
    await screen.findByRole('button', { name: /bob/ });
    await act(() => core.rooms.join({ jid: HALL, nick: 'alice' }));
    const rows = await screen.findAllByRole('button', { name: /bob|hall/ });
    expect(rows[0]).toHaveTextContent('hall');
  });

  it('shows the mentions count as the sidebar badge', async () => {
    const { deps, core } = await signedIn();
    await act(() => core.rooms.join({ jid: HALL, nick: 'alice' }));
    const [room] = await core.rooms.list();
    if (!room) throw new Error('no room');
    act(() => deps.fakes.room.change({ ...room, unreadCount: 5, mentionsCount: 2 }));
    const row = await screen.findByRole('button', { name: /hall/ });
    expect(await within(row).findByText('2')).toBeInTheDocument();
    expect(within(row).getByText('mentions')).toBeInTheDocument();
    expect(within(row).queryByText('5')).not.toBeInTheDocument();
  });
});
