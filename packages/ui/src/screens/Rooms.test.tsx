import { DomainError, type FakeDependencies } from '@hey-postie/core';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { App } from '../App';
import { setupCore } from '../test-utils';

const HALL = 'hall@rooms.x.org';

async function signedIn(before: (deps: FakeDependencies) => void = () => {}) {
  const { deps, core } = setupCore();
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

/** Joins the hall through the service and opens it from the sidebar. */
async function inHall(deps: FakeDependencies, core: ReturnType<typeof setupCore>['core']) {
  await act(() => core.rooms.join({ jid: HALL, nick: 'alice' }));
  act(() => {
    deps.fakes.room.setMembers(HALL, [
      { nick: 'alice', role: 'participant', affiliation: 'member' },
      { nick: 'bob', role: 'moderator', affiliation: 'owner' },
      { nick: 'brenda', role: 'visitor', affiliation: 'none' },
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
    expect(within(region).getByTitle('Mentions you')).toHaveTextContent('alice: look');
    expect(within(region).getByText('hi').closest('[title]')).toBeNull();
  });

  it('completes a nick with Tab', async () => {
    const { deps, core } = await signedIn();
    const region = await inHall(deps, core);
    const area = within(region).getByRole('textbox', { name: /Write/ });
    fireEvent.change(area, { target: { value: 'hello bo' } });
    await waitFor(() => {
      fireEvent.keyDown(area, { key: 'Tab' });
      expect(area).toHaveValue('hello bob ');
    });
    fireEvent.change(area, { target: { value: 'br' } });
    fireEvent.keyDown(area, { key: 'Tab' });
    expect(area).toHaveValue('brenda: ');
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
    const headings = await within(pane).findAllByRole('heading', { level: 3 });
    expect(headings.map((h) => h.textContent)).toEqual(['Moderators', 'Participants', 'Visitors']);
    expect(within(pane).getByText('Letters and stamps')).toBeInTheDocument();
    expect(within(pane).getByText('owner')).toBeInTheDocument();
    expect(within(pane).getByRole('radio', { name: 'Mentions only' })).toBeChecked();
    fireEvent.click(within(pane).getByRole('radio', { name: 'All messages' }));
    await waitFor(() =>
      expect(within(pane).getByRole('radio', { name: 'All messages' })).toBeChecked(),
    );
    expect((await core.rooms.list())[0]?.notify).toBe('all');
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
