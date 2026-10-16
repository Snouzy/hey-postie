import { act, fireEvent, render, screen } from '@testing-library/react';
import { useRef, useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type PaneBounds, readPaneSizes } from '../core/settings';
import { usePaneSizes } from '../core/usePaneSizes';
import { PaneResizer } from './PaneResizer';

const BOUNDS: PaneBounds = { min: 220, max: 480, default: 300 };

/** A sidebar-like pane: the sizes hook, the target carrying the variable, the resizer. */
function Harness({ pane = 'left' as 'left' | 'right' }) {
  const target = useRef<HTMLDivElement>(null);
  const { sizes, update } = usePaneSizes();
  const [closed, setClosed] = useState(0); // the details pane counts its closings
  return (
    <div ref={target} data-testid="target" style={{ '--w': `${sizes.sidebar}px` } as object}>
      <PaneResizer
        pane={pane}
        bounds={BOUNDS}
        width={sizes.sidebar}
        collapsed={sizes.sidebarCollapsed}
        target={target}
        variable="--w"
        controls="pane"
        label="Resize"
        onResize={(sidebar) => update({ sidebar })}
        onCollapse={() => {
          update({ sidebarCollapsed: true });
          setClosed((n) => n + 1);
        }}
        onExpand={() => update({ sidebarCollapsed: false })}
      />
      <p id="pane" hidden={sizes.sidebarCollapsed}>
        content {closed}
      </p>
    </div>
  );
}

const captured = new Set<number>();

beforeEach(() => {
  window.localStorage.clear();
  captured.clear();
  // jsdom has no pointer capture; the resizer needs something to call and read back.
  HTMLElement.prototype.setPointerCapture = (id: number) => void captured.add(id);
  HTMLElement.prototype.releasePointerCapture = (id: number) => void captured.delete(id);
  HTMLElement.prototype.hasPointerCapture = (id: number) => captured.has(id);
  // The move loop runs in a frame: synchronous here, so each move is observable at once.
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    callback(0);
    return 1;
  });
  vi.stubGlobal('cancelAnimationFrame', () => {});
});

afterEach(() => vi.unstubAllGlobals());

function separator() {
  return screen.getByRole('separator', { name: 'Resize' });
}

function variable() {
  return screen.getByTestId('target').style.getPropertyValue('--w');
}

function drag(handle: HTMLElement, from: number, ...to: number[]) {
  fireEvent.pointerDown(handle, { button: 0, pointerId: 1, clientX: from });
  for (const x of to) fireEvent.pointerMove(handle, { pointerId: 1, clientX: x });
}

describe('PaneResizer', () => {
  it('is a vertical separator with the pane as its value', () => {
    render(<Harness />);
    const handle = separator();
    expect(handle).toHaveAttribute('aria-orientation', 'vertical');
    expect(handle).toHaveAttribute('aria-controls', 'pane');
    expect(handle).toHaveAttribute('aria-valuemin', '0');
    expect(handle).toHaveAttribute('aria-valuemax', '480');
    expect(handle).toHaveAttribute('aria-valuenow', '300');
    expect(handle).toHaveAttribute('tabindex', '0');
  });

  it('writes the width to the CSS variable while dragging and persists it on release', () => {
    render(<Harness />);
    const handle = separator();
    drag(handle, 300, 340);
    expect(variable()).toBe('340px');
    expect(document.body.classList.contains('resizing')).toBe(true);
    expect(captured.has(1)).toBe(true);
    // The state (and the storage) did not move yet.
    expect(readPaneSizes().sidebar).toBe(300);

    fireEvent.pointerMove(handle, { pointerId: 1, clientX: 360 });
    expect(handle).toHaveAttribute('aria-valuenow', '360');
    fireEvent.pointerUp(handle, { pointerId: 1, clientX: 360 });
    expect(readPaneSizes().sidebar).toBe(360);
    expect(handle).toHaveAttribute('aria-valuenow', '360');
    expect(document.body.classList.contains('resizing')).toBe(false);
    expect(captured.has(1)).toBe(false);
  });

  it('stays within its bounds', () => {
    render(<Harness />);
    const handle = separator();
    drag(handle, 300, 900);
    expect(variable()).toBe('480px');
    fireEvent.pointerUp(handle, { pointerId: 1, clientX: 900 });
    expect(readPaneSizes().sidebar).toBe(480);
    drag(handle, 480, 210);
    expect(variable()).toBe('220px'); // under the minimum, not yet under the fold point
    fireEvent.pointerUp(handle, { pointerId: 1, clientX: 210 });
    expect(readPaneSizes().sidebar).toBe(220);
  });

  it('mirrors the direction for a pane on the right', () => {
    render(<Harness pane="right" />);
    const handle = separator();
    drag(handle, 600, 560);
    expect(variable()).toBe('340px');
    fireEvent.pointerUp(handle, { pointerId: 1, clientX: 560 });
    expect(readPaneSizes().sidebar).toBe(340);
  });

  it('folds the pane dragged past the minimum minus 40px, and unfolds it dragged back', () => {
    render(<Harness />);
    const handle = separator();
    drag(handle, 300, 200, 179);
    expect(screen.getByText(/content/)).not.toBeVisible();
    expect(handle).toHaveAttribute('aria-valuenow', '0');
    expect(handle).toHaveAttribute('data-collapsed');
    expect(readPaneSizes().sidebarCollapsed).toBe(true);

    fireEvent.pointerMove(handle, { pointerId: 1, clientX: 200 });
    expect(screen.getByText(/content/)).toBeVisible();
    expect(variable()).toBe('220px');
    fireEvent.pointerUp(handle, { pointerId: 1, clientX: 200 });
    expect(readPaneSizes()).toEqual({ sidebar: 220, details: 280, sidebarCollapsed: false });
  });

  it('reopens a folded pane by dragging its grabber', () => {
    window.localStorage.setItem('hey-postie:panes', JSON.stringify({ sidebarCollapsed: true }));
    render(<Harness />);
    const handle = separator();
    expect(screen.getByText(/content/)).not.toBeVisible();
    drag(handle, 0, 100);
    expect(screen.getByText(/content/)).not.toBeVisible(); // still under the fold point
    fireEvent.pointerMove(handle, { pointerId: 1, clientX: 250 });
    expect(screen.getByText(/content/)).toBeVisible();
    expect(variable()).toBe('250px');
    fireEvent.pointerUp(handle, { pointerId: 1, clientX: 250 });
    expect(readPaneSizes()).toEqual({ sidebar: 250, details: 280, sidebarCollapsed: false });
  });

  it('puts the width back on a cancelled gesture', () => {
    render(<Harness />);
    const handle = separator();
    drag(handle, 300, 400);
    fireEvent.pointerCancel(handle, { pointerId: 1 });
    expect(variable()).toBe('300px');
    expect(readPaneSizes().sidebar).toBe(300);
    expect(document.body.classList.contains('resizing')).toBe(false);
  });

  it('ignores a second button and a foreign pointer', () => {
    render(<Harness />);
    const handle = separator();
    fireEvent.pointerDown(handle, { button: 2, pointerId: 1, clientX: 300 });
    fireEvent.pointerMove(handle, { pointerId: 1, clientX: 400 });
    expect(variable()).toBe('300px');
    drag(handle, 300);
    fireEvent.pointerMove(handle, { pointerId: 2, clientX: 400 });
    expect(variable()).toBe('300px');
  });

  it('moves by 16px with the arrows, 64px with Shift, Home and End to the bounds', () => {
    render(<Harness />);
    const handle = separator();
    fireEvent.keyDown(handle, { key: 'ArrowRight' });
    expect(readPaneSizes().sidebar).toBe(316);
    expect(variable()).toBe('316px');
    fireEvent.keyDown(handle, { key: 'ArrowLeft', shiftKey: true });
    expect(readPaneSizes().sidebar).toBe(252);
    fireEvent.keyDown(handle, { key: 'End' });
    expect(readPaneSizes().sidebar).toBe(480);
    fireEvent.keyDown(handle, { key: 'ArrowRight' });
    expect(readPaneSizes().sidebar).toBe(480);
    fireEvent.keyDown(handle, { key: 'Home' });
    expect(readPaneSizes().sidebar).toBe(220);
    fireEvent.keyDown(handle, { key: 'ArrowLeft' });
    expect(readPaneSizes().sidebar).toBe(220); // the minimum: folding is Enter's job
    expect(screen.getByText(/content/)).toBeVisible();
  });

  it('mirrors the arrows for a pane on the right', () => {
    render(<Harness pane="right" />);
    fireEvent.keyDown(separator(), { key: 'ArrowLeft' });
    expect(readPaneSizes().sidebar).toBe(316);
  });

  it('folds and unfolds with Enter or Space, and unfolds with the widening arrow', () => {
    render(<Harness />);
    const handle = separator();
    fireEvent.keyDown(handle, { key: 'Enter' });
    expect(screen.getByText(/content/)).not.toBeVisible();
    expect(handle).toHaveAttribute('aria-valuenow', '0');
    fireEvent.keyDown(handle, { key: ' ' });
    expect(screen.getByText(/content/)).toBeVisible();
    expect(handle).toHaveAttribute('aria-valuenow', '300');
    fireEvent.keyDown(handle, { key: 'Enter' });
    fireEvent.keyDown(handle, { key: 'ArrowRight' });
    expect(screen.getByText(/content/)).toBeVisible();
    expect(readPaneSizes().sidebar).toBe(300); // opened at its last width, not widened
  });

  it('resets to the default on a double-click, unfolding first', () => {
    render(<Harness />);
    const handle = separator();
    fireEvent.keyDown(handle, { key: 'End' });
    fireEvent.keyDown(handle, { key: 'Enter' });
    fireEvent.doubleClick(handle);
    expect(screen.getByText(/content/)).toBeVisible();
    expect(readPaneSizes()).toEqual({ sidebar: 300, details: 280, sidebarCollapsed: false });
  });

  it('restores the persisted size on mount, clamped to the bounds', () => {
    window.localStorage.setItem('hey-postie:panes', JSON.stringify({ sidebar: 999, details: 1 }));
    render(<Harness />);
    expect(separator()).toHaveAttribute('aria-valuenow', '480');
    expect(variable()).toBe('480px');
    expect(readPaneSizes().details).toBe(240);
  });

  it('cleans the body up when it unmounts mid-drag', () => {
    const { unmount } = render(<Harness />);
    drag(separator(), 300, 320);
    expect(document.body.classList.contains('resizing')).toBe(true);
    act(() => unmount());
    expect(document.body.classList.contains('resizing')).toBe(false);
  });
});
