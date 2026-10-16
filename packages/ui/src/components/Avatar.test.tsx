import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Avatar, initialsOf, toneOf } from './Avatar';

describe('Avatar', () => {
  it('shows the picture with an empty alt when the server has one', () => {
    render(<Avatar name="Bob" jid="bob@x.org" avatarUrl="blob:avatar" />);
    const image = screen.getByRole('presentation');
    expect(image).toHaveAttribute('src', 'blob:avatar');
    expect(image).toHaveAttribute('alt', '');
  });

  it('falls back to the initials on a colour derived from the JID, hidden from readers', () => {
    const { container } = render(<Avatar name="Bob Marley" jid="bob@x.org" />);
    const fallback = container.firstElementChild;
    expect(fallback).toHaveTextContent('BM');
    expect(fallback).toHaveAttribute('aria-hidden', 'true');
    expect(fallback).toHaveAttribute('data-tone', toneOf('bob@x.org'));
  });

  it('keeps the same colour for the same JID and takes at most two initials', () => {
    expect(toneOf('bob@x.org')).toBe(toneOf('bob@x.org'));
    expect(initialsOf('Ann Bea Cole')).toBe('AB');
    expect(initialsOf('bob@x.org')).toBe('B');
    expect(initialsOf('  ')).toBe('');
  });
});
