import { HIDDEN_PREVIEW } from '@hey-postie/core';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../App';
import { FINGERPRINT, FORMATTED, OTHER } from '../../screens/seal-test-helpers';
import { setupCore } from '../../test-utils';

async function openSettings(version?: string) {
  const { deps, core } = setupCore();
  const onOpenLink = vi.fn();
  render(<App core={core} locale="en" onOpenLink={onOpenLink} {...(version ? { version } : {})} />);
  await act(() => core.accounts.signIn({ jid: 'alice@x.org', password: 'pw', remember: false }));
  fireEvent.click(screen.getByRole('button', { name: 'alice' }));
  fireEvent.click(screen.getByRole('menuitem', { name: 'Settings…' }));
  return { deps, core, onOpenLink, dialog: screen.getByRole('dialog', { name: 'Settings' }) };
}

function show(section: string) {
  fireEvent.click(screen.getByRole('tab', { name: section }));
  return screen.getByRole('tabpanel', { name: section });
}

beforeEach(() => {
  window.localStorage.clear();
  delete document.documentElement.dataset.theme;
});

afterEach(() => {
  window.localStorage.clear();
  delete document.documentElement.dataset.theme;
});

describe('Settings window: navigation', () => {
  it('opens on General with the focus on its tab, and lists the six sections', async () => {
    await openSettings();
    const tabs = screen.getAllByRole('tab').map((tab) => tab.textContent);
    expect(tabs).toEqual([
      'General',
      'Account',
      'Appearance',
      'Notifications',
      'Privacy and encryption',
      'Advanced',
    ]);
    expect(screen.getByRole('tab', { name: 'General' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'General' })).toHaveFocus();
    expect(screen.getByRole('tabpanel', { name: 'General' })).toBeInTheDocument();
  });

  it('moves and selects with the arrows, Home and End', async () => {
    await openSettings();
    const list = screen.getByRole('tablist', { name: 'Settings sections' });
    fireEvent.keyDown(list, { key: 'ArrowDown' });
    expect(screen.getByRole('tab', { name: 'Account' })).toHaveFocus();
    expect(screen.getByRole('tabpanel', { name: 'Account' })).toBeInTheDocument();
    fireEvent.keyDown(list, { key: 'End' });
    expect(screen.getByRole('tab', { name: 'Advanced' })).toHaveFocus();
    fireEvent.keyDown(list, { key: 'ArrowDown' });
    expect(screen.getByRole('tab', { name: 'Advanced' })).toHaveFocus();
    fireEvent.keyDown(list, { key: 'ArrowUp' });
    expect(screen.getByRole('tabpanel', { name: 'Privacy and encryption' })).toBeInTheDocument();
    fireEvent.keyDown(list, { key: 'Home' });
    expect(screen.getByRole('tab', { name: 'General' })).toHaveFocus();
    // One Tab stop: only the selected tab is reachable by Tab.
    expect(screen.getByRole('tab', { name: 'Account' })).toHaveAttribute('tabindex', '-1');
  });

  it('closes on Escape with the focus back on the account row', async () => {
    await openSettings();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'Settings' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'alice' })).toHaveFocus();
  });
});

describe('Settings window: appearance', () => {
  it('sets data-theme on <html> and remembers the choice', async () => {
    await openSettings();
    show('Appearance');
    fireEvent.click(screen.getByRole('radio', { name: 'Dark' }));
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(window.localStorage.getItem('hey-postie:theme')).toBe('dark');
    fireEvent.click(screen.getByRole('radio', { name: 'Light' }));
    expect(document.documentElement.dataset.theme).toBe('light');
    fireEvent.click(screen.getByRole('radio', { name: 'Follow the system' }));
    expect(document.documentElement.dataset.theme).toBeUndefined();
    expect(window.localStorage.getItem('hey-postie:theme')).toBeNull();
  });

  // jsdom cannot show a paint; the layout effect runs before React returns from render.
  it('has applied the stored theme by the time render() returns', () => {
    window.localStorage.setItem('hey-postie:theme', 'dark');
    const { core } = setupCore();
    render(<App core={core} locale="en" />);
    expect(document.documentElement.dataset.theme).toBe('dark');
  });

  it('ignores a value it does not know and leaves the system in charge', () => {
    window.localStorage.setItem('hey-postie:theme', 'sepia');
    const { core } = setupCore();
    render(<App core={core} locale="en" />);
    expect(document.documentElement.dataset.theme).toBeUndefined();
  });

  it('starts with the defaults when reading storage throws', () => {
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied');
    });
    const { core } = setupCore();
    render(<App core={core} locale="fr" />);
    expect(document.documentElement.dataset.theme).toBeUndefined();
    expect(core.notifications.getShowPreview()).toBe(true);
    expect(screen.getByRole('button', { name: 'Se connecter' })).toBeInTheDocument();
    spy.mockRestore();
  });

  it('still works when storage refuses', async () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('denied');
    });
    await openSettings();
    show('Appearance');
    fireEvent.click(screen.getByRole('radio', { name: 'Dark' }));
    expect(document.documentElement.dataset.theme).toBe('dark');
    spy.mockRestore();
  });
});

describe('Settings window: notifications', () => {
  it('hides the letter from the notifier when the preview is off, and remembers it', async () => {
    const { deps } = await openSettings();
    show('Notifications');
    const toggle = screen.getByRole('checkbox', { name: /Show the letter/ });
    expect(toggle).toBeChecked();
    fireEvent.click(toggle);
    expect(toggle).not.toBeChecked();
    expect(window.localStorage.getItem('hey-postie:notify-preview')).toBe('off');
    fireEvent.blur(window);
    act(() => {
      deps.fakes.chat.receive({ chatId: 'bob@x.org', fromJid: 'bob@x.org', body: 'secret' });
    });
    await waitFor(() => expect(deps.fakes.notifier.shown).toHaveLength(1));
    expect(deps.fakes.notifier.shown[0]?.body).toBe(HIDDEN_PREVIEW);
  });

  it('applies the stored choice before a letter can arrive', async () => {
    window.localStorage.setItem('hey-postie:notify-preview', 'off');
    const { deps, core } = setupCore();
    render(<App core={core} locale="en" />);
    expect(core.notifications.getShowPreview()).toBe(false);
    // Right after render, before any effect-driven work: the body is already hidden.
    deps.fakes.chat.receive({ chatId: 'bob@x.org', fromJid: 'bob@x.org', body: 'secret' });
    await waitFor(() => expect(deps.fakes.notifier.shown).toHaveLength(1));
    expect(deps.fakes.notifier.shown[0]?.body).toBe(HIDDEN_PREVIEW);
  });
});

describe('Settings window: general (language)', () => {
  it('re-renders in the picked language at once and remembers it', async () => {
    await openSettings();
    fireEvent.click(screen.getByRole('radio', { name: 'Français' }));
    expect(screen.getByRole('dialog', { name: 'Réglages' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Général' })).toBeInTheDocument();
    expect(
      screen.getByRole('searchbox', { name: 'Rechercher une discussion' }),
    ).toBeInTheDocument();
    expect(window.localStorage.getItem('hey-postie:locale')).toBe('fr');
    // The languages keep their own names, whatever the current one.
    expect(screen.getByRole('radio', { name: 'English' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('radio', { name: 'Langue du système' }));
    expect(screen.getByRole('dialog', { name: 'Settings' })).toBeInTheDocument();
    expect(window.localStorage.getItem('hey-postie:locale')).toBeNull();
  });

  it('starts in the stored language, not the system one', () => {
    window.localStorage.setItem('hey-postie:locale', 'fr');
    const { core } = setupCore();
    render(<App core={core} locale="en" />);
    expect(screen.getByRole('button', { name: 'Se connecter' })).toBeInTheDocument();
  });
});

describe('Settings window: account', () => {
  it('shows who is signed in and whether the password is kept', async () => {
    await openSettings();
    const panel = show('Account');
    expect(within(panel).getByText('alice')).toBeInTheDocument();
    expect(within(panel).getByText('alice@x.org')).toBeInTheDocument();
    expect(await within(panel).findByText(/not kept/)).toBeInTheDocument();
  });

  it('signs out from the window', async () => {
    const { deps } = await openSettings();
    show('Account');
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    await screen.findByRole('button', { name: 'Sign in' });
    expect(deps.fakes.xmpp.connected).toBe(false);
  });

  it('opens the delete dialog in place of the window, and comes back on Esc', async () => {
    await openSettings();
    show('Account');
    fireEvent.click(screen.getByRole('button', { name: 'Delete my account…' }));
    expect(screen.getByRole('dialog', { name: 'Delete my account' })).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'Settings' })).not.toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.getByRole('dialog', { name: 'Settings' })).toBeInTheDocument();
    expect(screen.getByRole('tabpanel', { name: 'Account' })).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Delete my account…' })).toHaveFocus(),
    );
  });
});

describe('Settings window: privacy and encryption', () => {
  it('lists my devices with this device’s fingerprint, and removes one', async () => {
    const { deps } = await openSettings();
    deps.fakes.crypto.seed(
      deps.fakes.crypto.ownJid,
      { deviceId: 1, fingerprint: FINGERPRINT },
      { deviceId: 2, fingerprint: OTHER },
    );
    const panel = show('Privacy and encryption');
    const list = await within(panel).findByRole('list', { name: 'My devices' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(2);
    const line = await within(panel).findByText('This device’s fingerprint');
    expect(line).toHaveTextContent(FORMATTED);
    expect(within(panel).getByText(/Compare its fingerprint/)).toBeInTheDocument();
    fireEvent.click(within(list).getByRole('button', { name: 'Remove' }));
    fireEvent.click(within(panel).getByRole('button', { name: 'Remove' }));
    await waitFor(() => expect(within(panel).getAllByRole('listitem')).toHaveLength(1));
    expect((await deps.fakes.crypto.ownDevices()).map((d) => d.deviceId)).toEqual([1]);
  });
});

describe('Settings window: advanced (about)', () => {
  it('shows the version the host gave, with the license note', async () => {
    await openSettings('1.2.3');
    const panel = show('Advanced');
    expect(panel).toHaveTextContent('Hey Postie 1.2.3');
    expect(panel).toHaveTextContent(/AGPL-3.0/);
  });

  it('shows "dev" without a version', async () => {
    await openSettings();
    expect(show('Advanced')).toHaveTextContent('Hey Postie dev');
  });

  it('routes the website and repository links through onOpenLink', async () => {
    const { onOpenLink } = await openSettings();
    show('Advanced');
    fireEvent.click(screen.getByRole('link', { name: 'Source code' }));
    fireEvent.click(screen.getByRole('link', { name: 'Website' }));
    expect(onOpenLink).toHaveBeenCalledTimes(2);
    for (const [url] of onOpenLink.mock.calls) expect(url).toMatch(/^https:\/\//);
  });

  it('opens Licenses in place of Settings, and comes back on close', async () => {
    await openSettings();
    show('Advanced');
    fireEvent.click(screen.getByRole('button', { name: 'Licenses' }));
    expect(screen.getByRole('dialog', { name: 'Licenses' })).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'Settings' })).not.toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.getByRole('dialog', { name: 'Settings' })).toBeInTheDocument();
    expect(screen.getByRole('tabpanel', { name: 'Advanced' })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Licenses' })).toHaveFocus());
  });
});
