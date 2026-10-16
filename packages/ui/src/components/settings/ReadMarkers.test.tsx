import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { App } from '../../App';
import { setupCore } from '../../test-utils';

afterEach(() => window.localStorage.clear());

async function openPrivacy() {
  const setup = setupCore();
  render(<App core={setup.core} locale="en" />);
  await act(() =>
    setup.core.accounts.signIn({ jid: 'alice@x.org', password: 'pw', remember: false }),
  );
  fireEvent.click(screen.getByRole('button', { name: 'alice' }));
  fireEvent.click(screen.getByRole('menuitem', { name: 'Settings…' }));
  fireEvent.click(screen.getByRole('tab', { name: 'Privacy and encryption' }));
  return setup;
}

describe('Settings › Privacy: read stamps', () => {
  it('tells others by default, and stops when the box is unticked, remembered', async () => {
    const { deps } = await openPrivacy();
    const box = screen.getByRole('checkbox', {
      name: 'Tell others when I have read their letters',
    });
    expect(box).toBeChecked();
    expect(box).toHaveAccessibleDescription(/nobody sees that you read/);
    expect(deps.fakes.chat.sendReadMarkers).toBe(true);
    fireEvent.click(box);
    expect(box).not.toBeChecked();
    expect(deps.fakes.chat.sendReadMarkers).toBe(false);
    expect(window.localStorage.getItem('hey-postie:read-markers')).toBe('off');
    fireEvent.click(box);
    expect(deps.fakes.chat.sendReadMarkers).toBe(true);
    expect(window.localStorage.getItem('hey-postie:read-markers')).toBeNull();
  });

  it('tells the core the stored choice on the first render', () => {
    window.localStorage.setItem('hey-postie:read-markers', 'off');
    const { deps, core } = setupCore();
    render(<App core={core} locale="en" />);
    expect(deps.fakes.chat.sendReadMarkers).toBe(false);
  });
});
