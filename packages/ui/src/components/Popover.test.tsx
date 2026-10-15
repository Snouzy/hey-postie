import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Popover } from './Popover';

function rect(top: number): DOMRect {
  return { top, bottom: top + 20, left: 100, right: 140, width: 40, height: 20 } as DOMRect;
}

describe('Popover', () => {
  it('sits above its anchor and follows it when the page scrolls', () => {
    const anchor = document.createElement('button');
    document.body.appendChild(anchor);
    const at = vi.spyOn(anchor, 'getBoundingClientRect').mockReturnValue(rect(500));
    render(
      <Popover anchor={anchor} label="Card" onClose={() => {}}>
        hello
      </Popover>,
    );
    const card = screen.getByRole('dialog', { name: 'Card' });
    expect(card).toHaveStyle({ top: '492px', left: '100px' });
    at.mockReturnValue(rect(300));
    fireEvent.scroll(document);
    expect(card).toHaveStyle({ top: '292px' });
    anchor.remove();
  });

  it('closes on a click outside, not on one inside or on the anchor', () => {
    const anchor = document.createElement('button');
    document.body.appendChild(anchor);
    const onClose = vi.fn();
    render(
      <Popover anchor={anchor} label="Card" onClose={onClose}>
        <button type="button">inside</button>
      </Popover>,
    );
    fireEvent.pointerDown(screen.getByRole('button', { name: 'inside' }));
    fireEvent.pointerDown(anchor);
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.pointerDown(document.body);
    expect(onClose).toHaveBeenCalledTimes(1);
    anchor.remove();
  });
});
