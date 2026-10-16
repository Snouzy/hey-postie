import { type KeyboardEvent, type PointerEvent, type RefObject, useEffect, useRef } from 'react';
import { clampPane, type PaneBounds } from '../core/settings';
import styles from './PaneResizer.module.css';

/** Dragged this far under the minimum, the pane folds instead of fighting the bound. */
const COLLAPSE_SLACK = 40;
const KEY_STEP = 16;
const KEY_STEP_LARGE = 64;
/** On `body` for the whole gesture: the cursor stays, nothing gets selected on the way. */
const BODY_CLASS = 'resizing';

interface PaneResizerProps {
  /** Which side of the divider the pane sits on. */
  pane: 'left' | 'right';
  bounds: PaneBounds;
  /** The pane's width at rest. */
  width: number;
  collapsed: boolean;
  /** The element carrying the CSS variable the pane's width reads, and the variable's name. */
  target: RefObject<HTMLElement | null>;
  variable: string;
  /** The id of the pane. */
  controls: string;
  label: string;
  /** Once per gesture or key press, with the clamped width; never per pointer move. */
  onResize: (width: number) => void;
  onCollapse: () => void;
  onExpand: () => void;
}

interface Drag {
  pointerId: number;
  startX: number;
  startWidth: number;
  /** The live value, ahead of the React state until the pointer is released. */
  width: number;
  collapsed: boolean;
  /** A frame is scheduled; the flag is set before the request so a synchronous frame cannot race it. */
  pending: boolean;
  frame: number;
  clientX: number;
}

/**
 * The divider between a side pane and the conversation, as a resize handle: a 8px hit zone over
 * the 1px line, `role="separator"`, dragged with the pointer or moved with the keyboard.
 *
 * The width is read once, at `pointerdown`; each `pointermove` only does arithmetic on it and,
 * through one `requestAnimationFrame`, writes the CSS variable on the target. No React state
 * moves per pixel: the state (and the storage behind it) updates once, when the pointer is
 * released, or when the fold flips. A drag past the minimum minus 40px folds the pane; dragging
 * back past that point unfolds it in the same gesture.
 */
export function PaneResizer({
  pane,
  bounds,
  width,
  collapsed,
  target,
  variable,
  controls,
  label,
  onResize,
  onCollapse,
  onExpand,
}: PaneResizerProps) {
  const dragRef = useRef<Drag | null>(null);
  const visualWidth = collapsed ? 0 : width;

  useEffect(
    () => () => {
      // Unmounted mid-drag (the details pane closes when it folds): nothing may stay behind.
      if (dragRef.current?.pending) cancelAnimationFrame(dragRef.current.frame);
      dragRef.current = null;
      document.body.classList.remove(BODY_CLASS);
    },
    [],
  );

  function apply(px: number) {
    target.current?.style.setProperty(variable, `${px}px`);
  }

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    // Otherwise the browser starts a text selection under the drag, and the click's focus is
    // swallowed with it: the arrows must work right after a drag.
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    event.currentTarget.focus({ preventScroll: true });
    event.currentTarget.setAttribute('data-dragging', '');
    document.body.classList.add(BODY_CLASS);
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startWidth: visualWidth,
      width,
      collapsed,
      pending: false,
      frame: 0,
      clientX: event.clientX,
    };
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    drag.clientX = event.clientX;
    if (drag.pending) return;
    drag.pending = true;
    const handle = event.currentTarget;
    drag.frame = requestAnimationFrame(() => {
      drag.pending = false;
      const delta = drag.clientX - drag.startX;
      const raw = drag.startWidth + (pane === 'left' ? delta : -delta);
      const fold = raw < bounds.min - COLLAPSE_SLACK;
      if (fold !== drag.collapsed) {
        drag.collapsed = fold;
        if (fold) onCollapse();
        else onExpand();
      }
      if (!fold) {
        drag.width = clampPane(bounds, raw);
        apply(drag.width);
      }
      handle.setAttribute('aria-valuenow', String(fold ? 0 : drag.width));
    });
  }

  function endDrag(event: PointerEvent<HTMLDivElement>): Drag | null {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return null;
    dragRef.current = null;
    if (drag.pending) cancelAnimationFrame(drag.frame);
    document.body.classList.remove(BODY_CLASS);
    event.currentTarget.removeAttribute('data-dragging');
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    return drag;
  }

  function onPointerUp(event: PointerEvent<HTMLDivElement>) {
    const drag = endDrag(event);
    if (drag && !drag.collapsed && drag.width !== width) onResize(drag.width);
  }

  function onPointerCancel(event: PointerEvent<HTMLDivElement>) {
    const drag = endDrag(event);
    if (!drag) return;
    // Back to where the gesture started: nothing was committed.
    if (drag.collapsed !== collapsed) (collapsed ? onCollapse : onExpand)();
    apply(width);
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const step = event.shiftKey ? KEY_STEP_LARGE : KEY_STEP;
    // The arrows move the divider: Right widens a left pane and narrows a right one.
    const wider = pane === 'left' ? 'ArrowRight' : 'ArrowLeft';
    const narrower = pane === 'left' ? 'ArrowLeft' : 'ArrowRight';
    switch (event.key) {
      case wider:
        if (collapsed) onExpand();
        else if (width < bounds.max) onResize(clampPane(bounds, width + step));
        break;
      case narrower:
        if (!collapsed && width > bounds.min) onResize(clampPane(bounds, width - step));
        break;
      case 'Home':
        if (collapsed) onExpand();
        if (width !== bounds.min) onResize(bounds.min);
        break;
      case 'End':
        if (collapsed) onExpand();
        if (width !== bounds.max) onResize(bounds.max);
        break;
      case 'Enter':
      case ' ':
        (collapsed ? onExpand : onCollapse)();
        break;
      default:
        return;
    }
    event.preventDefault();
  }

  function onDoubleClick() {
    if (collapsed) onExpand();
    if (width !== bounds.default) onResize(bounds.default);
  }

  return (
    // biome-ignore lint/a11y/useSemanticElements: a separator with a value is the ARIA role for a resize handle; no element carries it natively.
    <div
      role="separator"
      tabIndex={0}
      aria-orientation="vertical"
      aria-label={label}
      aria-controls={controls}
      aria-valuemin={0}
      aria-valuemax={bounds.max}
      aria-valuenow={visualWidth}
      data-pane={pane}
      data-collapsed={collapsed || undefined}
      className={styles.resizer}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onLostPointerCapture={onPointerUp}
      onKeyDown={onKeyDown}
      onDoubleClick={onDoubleClick}
    />
  );
}
