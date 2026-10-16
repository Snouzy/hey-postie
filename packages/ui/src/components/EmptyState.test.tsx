import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { EmptyState } from './EmptyState';

describe('EmptyState', () => {
  it('renders the illustration, the title, the sentence and the action', () => {
    const onClick = vi.fn();
    render(
      <EmptyState
        illustration={<svg role="img" aria-label="Postie" />}
        title="Nothing here"
        sentence="Not a letter in sight."
        action={{ label: 'Do something', onClick }}
      />,
    );
    expect(screen.getByRole('img', { name: 'Postie' })).toBeInTheDocument();
    expect(screen.getByText('Nothing here')).toBeInTheDocument();
    expect(screen.getByText('Not a letter in sight.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Do something' }));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('shows no button when there is nothing to do', () => {
    render(<EmptyState title="Quiet" />);
    expect(screen.getByText('Quiet')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
