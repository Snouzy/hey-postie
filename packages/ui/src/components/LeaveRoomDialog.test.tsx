import { DomainError, type Room } from '@hey-postie/core';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithCore, setupCore } from '../test-utils';
import { LeaveRoomDialog } from './LeaveRoomDialog';

const ROOM: Room = {
  jid: 'hall@rooms.x.org',
  name: 'Sorting office',
  nick: 'alice',
  joined: true,
  bookmarked: true,
  notify: 'mentions',
  unreadCount: 0,
  mentionsCount: 0,
};

describe('LeaveRoomDialog', () => {
  it('names the hall and says what stays', () => {
    const { core } = setupCore();
    renderWithCore(<LeaveRoomDialog room={ROOM} onClose={() => {}} onLeft={() => {}} />, core);
    expect(screen.getByRole('dialog', { name: 'Leave the hall' })).toHaveTextContent(
      'Leave Sorting office? I will forget its bookmark. The letters stay on the server.',
    );
  });

  it('Cancel closes without calling the service', () => {
    const { deps, core } = setupCore();
    const onClose = vi.fn();
    renderWithCore(<LeaveRoomDialog room={ROOM} onClose={onClose} onLeft={() => {}} />, core);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(deps.fakes.room.left).toEqual([]);
  });

  it('Leave calls rooms.leave and reports back', async () => {
    const { deps, core } = setupCore();
    const onLeft = vi.fn();
    renderWithCore(<LeaveRoomDialog room={ROOM} onClose={() => {}} onLeft={onLeft} />, core);
    fireEvent.click(screen.getByRole('button', { name: 'Leave' }));
    await waitFor(() => expect(onLeft).toHaveBeenCalledTimes(1));
    expect(deps.fakes.room.left).toEqual([ROOM.jid]);
  });

  it('keeps the card open with the sentence when the service refuses', async () => {
    const { deps, core } = setupCore();
    vi.spyOn(deps.room, 'leave').mockRejectedValue(new DomainError('ServerUnreachable'));
    const onLeft = vi.fn();
    const onClose = vi.fn();
    renderWithCore(<LeaveRoomDialog room={ROOM} onClose={onClose} onLeft={onLeft} />, core);
    fireEvent.click(screen.getByRole('button', { name: 'Leave' }));
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(onLeft).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Leave' })).toBeEnabled();
  });

  it('cannot be closed while the service answers', async () => {
    const { deps, core } = setupCore();
    let settle: () => void = () => {};
    vi.spyOn(deps.room, 'leave').mockReturnValue(
      new Promise<void>((resolve) => {
        settle = resolve;
      }),
    );
    const onClose = vi.fn();
    const onLeft = vi.fn();
    renderWithCore(<LeaveRoomDialog room={ROOM} onClose={onClose} onLeft={onLeft} />, core);
    fireEvent.click(screen.getByRole('button', { name: 'Leave' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Leave' })).toBeDisabled());
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(screen.getByRole('button', { name: 'Close' })).toBeDisabled();
    expect(onClose).not.toHaveBeenCalled();
    settle();
    await waitFor(() => expect(onLeft).toHaveBeenCalledTimes(1));
  });
});
