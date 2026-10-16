import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { App } from '../App';
import { setupCore } from '../test-utils';

describe('DevRibbon', () => {
  it('shows the worktree of a dev window', () => {
    const { core } = setupCore();
    render(<App core={core} locale="en" devLabel="hall · feat/m2-hall" />);
    expect(screen.getByText('DEV · hall · feat/m2-hall', { exact: false })).toBeInTheDocument();
  });

  it('is absent from a build', () => {
    const { core } = setupCore();
    render(<App core={core} locale="en" />);
    expect(screen.queryByText(/DEV ·/)).toBeNull();
  });
});
