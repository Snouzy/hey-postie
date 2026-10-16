import { HIDDEN_PREVIEW } from '@hey-postie/core';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../App';
import { setupCore } from '../test-utils';

async function openSettings(version?: string) {
  const { deps, core } = setupCore();
  const onOpenLink = vi.fn();
  render(<App core={core} locale="en" onOpenLink={onOpenLink} {...(version ? { version } : {})} />);
  await act(() => core.accounts.signIn({ jid: 'alice@x.org', password: 'pw', remember: false }));
  fireEvent.click(screen.getByRole('button', { name: 'alice' }));
  fireEvent.click(screen.getByRole('menuitem', { name: 'Settings…' }));
  return { deps, core, onOpenLink, dialog: screen.getByRole('dialog', { name: 'Settings' }) };
}

beforeEach(() => {
  window.localStorage.clear();
  delete document.documentElement.dataset.theme;
});

afterEach(() => {
  window.localStorage.clear();
  delete document.documentElement.dataset.theme;
});

describe('Settings: appearance', () => {
  it('sets data-theme on <html> and remembers the choice', async () => {
    await openSettings();
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
    fireEvent.click(screen.getByRole('radio', { name: 'Dark' }));
    expect(document.documentElement.dataset.theme).toBe('dark');
    spy.mockRestore();
  });
});

describe('Settings: notifications', () => {
  it('hides the letter from the notifier when the preview is off, and remembers it', async () => {
    const { deps } = await openSettings();
    const toggle = screen.getByRole('checkbox', { name: /Show the letter/ });
    expect(toggle).toBeChecked();
    fireEvent.click(toggle);
    expect(toggle).not.toBeChecked();
    expect(window.localStorage.getItem('hey-postie:notify-preview')).toBe('off');
    // Bob is a contact: a stranger's letter never notifies (message requests).
    deps.fakes.roster.seed({
      jid: 'bob@x.org',
      name: 'Bob',
      presence: 'online',
      subscription: 'both',
    });
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
    deps.fakes.roster.seed({
      jid: 'bob@x.org',
      name: 'Bob',
      presence: 'online',
      subscription: 'both',
    });
    render(<App core={core} locale="en" />);
    expect(core.notifications.getShowPreview()).toBe(false);
    // Right after render, before any effect-driven work: the body is already hidden.
    deps.fakes.chat.receive({ chatId: 'bob@x.org', fromJid: 'bob@x.org', body: 'secret' });
    await waitFor(() => expect(deps.fakes.notifier.shown).toHaveLength(1));
    expect(deps.fakes.notifier.shown[0]?.body).toBe(HIDDEN_PREVIEW);
  });
});

describe('Settings: language', () => {
  it('re-renders in the picked language at once and remembers it', async () => {
    await openSettings();
    fireEvent.click(screen.getByRole('radio', { name: 'Français' }));
    expect(screen.getByRole('dialog', { name: 'Réglages' })).toBeInTheDocument();
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

describe('Settings: about', () => {
  it('shows the version the host gave, or "dev"', async () => {
    const { dialog } = await openSettings('1.2.3');
    expect(dialog).toHaveTextContent('Hey Postie 1.2.3');
  });

  it('shows "dev" without a version', async () => {
    const { dialog } = await openSettings();
    expect(dialog).toHaveTextContent('Hey Postie dev');
  });

  it('routes the repository link through onOpenLink', async () => {
    const { onOpenLink } = await openSettings();
    fireEvent.click(screen.getByRole('link', { name: 'Source code' }));
    expect(onOpenLink).toHaveBeenCalledWith(expect.stringMatching(/^https:\/\//));
  });

  it('opens Licenses in place of Settings, and comes back on close', async () => {
    await openSettings();
    fireEvent.click(screen.getByRole('button', { name: 'Licenses' }));
    expect(screen.getByRole('dialog', { name: 'Licenses' })).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'Settings' })).not.toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.getByRole('dialog', { name: 'Settings' })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Licenses' })).toHaveFocus());
  });
});
