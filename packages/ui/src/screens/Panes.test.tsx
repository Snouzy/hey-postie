import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../App';
import { readPaneSizes } from '../core/settings';
import { setupCore } from '../test-utils';
import { withChat } from './seal-test-helpers';

async function signedIn() {
  const { deps, core } = setupCore();
  render(<App core={core} locale="en" />);
  await act(() => core.accounts.signIn({ jid: 'alice@x.org', password: 'pw', remember: false }));
  return { deps, core };
}

const captured = new Set<number>();

beforeEach(() => {
  window.localStorage.clear();
  HTMLElement.prototype.setPointerCapture = (id: number) => void captured.add(id);
  HTMLElement.prototype.releasePointerCapture = (id: number) => void captured.delete(id);
  HTMLElement.prototype.hasPointerCapture = (id: number) => captured.has(id);
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    callback(0);
    return 1;
  });
  vi.stubGlobal('cancelAnimationFrame', () => {});
});

afterEach(() => vi.unstubAllGlobals());

describe('the panes of the main screen', () => {
  it('restores the persisted widths on the main element', async () => {
    window.localStorage.setItem(
      'hey-postie:panes',
      JSON.stringify({ sidebar: 320, details: 400, sidebarCollapsed: false }),
    );
    await signedIn();
    const main = screen.getByRole('navigation').parentElement as HTMLElement;
    expect(main.style.getPropertyValue('--sidebar-width')).toBe('320px');
    expect(main.style.getPropertyValue('--details-width')).toBe('400px');
    const handle = screen.getByRole('separator', { name: 'Resize the sidebar' });
    expect(handle).toHaveAttribute('aria-valuenow', '320');
    expect(handle).toHaveAttribute('aria-controls', 'sidebar');
    expect(screen.getByRole('navigation')).toHaveAttribute('id', 'sidebar');
  });

  it('folds and unfolds the sidebar with Cmd/Ctrl+B', async () => {
    await signedIn();
    const sidebar = screen.getByRole('navigation');
    fireEvent.keyDown(window, { key: 'b', metaKey: true });
    expect(sidebar).not.toBeVisible();
    expect(sidebar).toHaveAttribute('inert');
    expect(readPaneSizes().sidebarCollapsed).toBe(true);
    // The grabber stays, and says the pane is folded.
    expect(screen.getByRole('separator', { name: 'Resize the sidebar' })).toHaveAttribute(
      'aria-valuenow',
      '0',
    );
    fireEvent.keyDown(window, { key: 'b', ctrlKey: true });
    expect(sidebar).toBeVisible();
    expect(readPaneSizes().sidebarCollapsed).toBe(false);

    fireEvent.keyDown(window, { key: 'b', metaKey: true });
    expect(sidebar).not.toBeVisible();
  });

  it('resizes the details pane from its own separator and closes it when dragged shut', async () => {
    const { deps } = await signedIn();
    await withChat(deps);
    fireEvent.click(screen.getByRole('button', { name: 'Details' }));
    const pane = screen.getByRole('complementary', { name: 'Details' });
    expect(pane).toBeInTheDocument();
    const handle = screen.getByRole('separator', { name: 'Resize the details pane' });
    expect(handle).toHaveAttribute('aria-controls', 'details');
    expect(document.getElementById('details')).toContainElement(pane);

    // A right pane grows when the divider goes left.
    fireEvent.pointerDown(handle, { button: 0, pointerId: 1, clientX: 700 });
    fireEvent.pointerMove(handle, { pointerId: 1, clientX: 640 });
    fireEvent.pointerUp(handle, { pointerId: 1, clientX: 640 });
    expect(readPaneSizes().details).toBe(340);

    fireEvent.pointerDown(handle, { button: 0, pointerId: 2, clientX: 700 });
    fireEvent.pointerMove(handle, { pointerId: 2, clientX: 900 });
    expect(screen.queryByRole('complementary', { name: 'Details' })).not.toBeInTheDocument();
    expect(document.body.classList.contains('resizing')).toBe(false);
    // The width at rest is kept for the next opening.
    expect(readPaneSizes().details).toBe(340);
    fireEvent.click(screen.getByRole('button', { name: 'Details' }));
    expect(screen.getByRole('separator', { name: 'Resize the details pane' })).toHaveAttribute(
      'aria-valuenow',
      '340',
    );
  });
});
