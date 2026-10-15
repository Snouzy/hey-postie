import { createCore, createFakeDependencies } from '@hey-postie/core';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { App } from '../App';

describe('Welcome', () => {
  it('shows the title, Postie and the two actions in French', () => {
    render(<App core={createCore(createFakeDependencies())} locale="fr" />);
    expect(screen.getByRole('heading', { name: 'Hey Postie' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /Postie/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Se connecter' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Créer un compte' })).toBeInTheDocument();
  });

  it('shows the English texts by default', () => {
    render(<App core={createCore(createFakeDependencies())} locale="en" />);
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument();
  });
});
