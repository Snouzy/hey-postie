import { DomainError } from '@hey-postie/core';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { App } from '../App';
import { setupCore } from '../test-utils';

function openSignIn(locale: 'en' | 'fr' = 'en') {
  const { deps, core } = setupCore();
  render(<App core={core} locale={locale} />);
  fireEvent.click(
    screen.getByRole('button', { name: locale === 'fr' ? 'Se connecter' : 'Sign in' }),
  );
  return { deps, core };
}

function fill(jid: string, password: string) {
  fireEvent.change(screen.getByLabelText('Address'), { target: { value: jid } });
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: password } });
  fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
}

describe('SignIn', () => {
  it('refuses a malformed address with Postie’s sentence, without touching the network', async () => {
    const { deps } = openSignIn();
    fill('not-an-address', 'secret');
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'That address does not look right. It should read name@server.',
    );
    expect(deps.fakes.xmpp.lastConnect).toBeNull();
  });

  it('speaks French when the locale is fr', async () => {
    openSignIn('fr');
    fireEvent.change(screen.getByLabelText('Adresse'), { target: { value: 'nope' } });
    fireEvent.change(screen.getByLabelText('Mot de passe'), { target: { value: 'x' } });
    fireEvent.click(screen.getByRole('button', { name: 'Se connecter' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Cette adresse ne me paraît pas bonne. Elle doit ressembler à nom@serveur.',
    );
  });

  it('shows the InvalidCredentials sentence when the server rejects the password', async () => {
    const { deps } = openSignIn();
    deps.fakes.xmpp.failWith = new DomainError('InvalidCredentials');
    fill('alice@example.org', 'wrong');
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The server did not accept this password.',
    );
    expect(screen.getByRole('img', { name: /surprised/ })).toBeInTheDocument();
  });

  it('moves to the main window on success', async () => {
    openSignIn();
    fill('alice@example.org', 'secret');
    expect(await screen.findByRole('searchbox', { name: 'Search chats' })).toBeInTheDocument();
    expect(screen.getByText('alice')).toBeInTheDocument();
  });

  it('prefills a remembered password when the address loses focus', async () => {
    const { deps } = openSignIn();
    await deps.fakes.keychain.set('alice@example.org', 'kept');
    const address = screen.getByLabelText('Address');
    fireEvent.change(address, { target: { value: 'alice@example.org' } });
    fireEvent.blur(address);
    await waitFor(() => expect(screen.getByLabelText('Password')).toHaveValue('kept'));
  });

  it('goes back to the welcome screen', () => {
    openSignIn();
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByRole('button', { name: 'Create an account' })).toBeInTheDocument();
  });
});
