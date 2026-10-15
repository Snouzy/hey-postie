import { DomainError, type RegistrationForm } from '@hey-postie/core';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { App } from '../App';
import { setupCore } from '../test-utils';

const PIXEL = 'data:image/png;base64,iVBORw0KGgo=';

const FORM: RegistrationForm = {
  domain: 'b.org',
  instructions: 'Choose a name and a password.',
  fields: [
    { name: 'username', label: 'User', type: 'text', required: true },
    { name: 'password', label: 'Pass', type: 'password', required: true },
    { name: 'email', label: 'Email address', type: 'email', required: false },
    { name: 'FORM_TYPE', label: '', type: 'hidden', required: false },
    { name: 'ocr', label: 'Enter the text you see', type: 'text', required: true },
  ],
  captchaImageDataUrl: PIXEL,
  captchaField: 'ocr',
};

function openCreateAccount(onOpenLink = vi.fn()) {
  const { deps, core } = setupCore();
  render(<App core={core} locale="en" onOpenLink={onOpenLink} />);
  fireEvent.click(screen.getByRole('button', { name: 'Create an account' }));
  return { deps, core, onOpenLink };
}

async function askServer(domain = 'b.org') {
  fireEvent.change(screen.getByLabelText('Server'), { target: { value: domain } });
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
  await screen.findByRole('heading', { name: 'Who?' });
}

function fillWho(username: string, password: string, repeat = password) {
  fireEvent.change(screen.getByLabelText('Username'), { target: { value: username } });
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: password } });
  fireEvent.change(screen.getByLabelText('Repeat password'), { target: { value: repeat } });
  fireEvent.change(screen.getByLabelText('What does the image say?'), {
    target: { value: 'abcd' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Create my account' }));
}

describe('CreateAccount', () => {
  it('starts on "Where?", focus in the server field, with the directory link', () => {
    const { onOpenLink } = openCreateAccount();
    expect(screen.getByRole('heading', { name: 'Where?' })).toBeInTheDocument();
    expect(screen.getByLabelText('Server')).toHaveFocus();
    expect(screen.getByLabelText('Server')).toHaveAccessibleDescription(/lives on a server/);
    const link = screen.getByRole('link', { name: /server directory/ });
    expect(link).toHaveAttribute('rel', 'noreferrer');
    fireEvent.click(link);
    expect(onOpenLink).toHaveBeenCalledWith('https://providers.xmpp.net');
  });

  it('stays on "Where?" with Postie’s sentence when the server has no registration', async () => {
    openCreateAccount();
    fireEvent.change(screen.getByLabelText('Server'), { target: { value: 'closed.org' } });
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This server does not let me open new accounts.',
    );
    expect(screen.getByRole('heading', { name: 'Where?' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try another server' })).toBeInTheDocument();
  });

  it('says so when the server cannot be reached', async () => {
    const { deps } = openCreateAccount();
    deps.fakes.transport.failWith = new DomainError('ServerUnreachable');
    fireEvent.change(screen.getByLabelText('Server'), { target: { value: 'far.org' } });
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('I cannot reach this server');
  });

  it('shows the server’s fields, the instructions and the CAPTCHA on "Who?"', async () => {
    const { deps } = openCreateAccount();
    deps.fakes.registration.forms.set('b.org', FORM);
    await askServer();
    expect(screen.getByLabelText('Username')).toHaveFocus();
    expect(screen.getByText(/Choose a name and a password/)).toBeInTheDocument();
    expect(screen.getByLabelText('Email address')).toHaveAttribute('type', 'email');
    expect(screen.queryByLabelText('FORM_TYPE')).not.toBeInTheDocument();
    expect(screen.getByRole('img', { name: /puzzle image/ })).toHaveAttribute('src', PIXEL);
    expect(screen.getByLabelText('What does the image say?')).toBeRequired();
  });

  it('blocks mismatched passwords without calling the server', async () => {
    const { deps } = openCreateAccount();
    deps.fakes.registration.forms.set('b.org', FORM);
    await askServer();
    fillWho('alice', 'longenough', 'different');
    expect(await screen.findByRole('alert')).toHaveTextContent('The two passwords do not match.');
    expect(deps.fakes.registration.submitted).toEqual([]);
  });

  it('blocks a short password and says how long it must be', async () => {
    const { deps } = openCreateAccount();
    deps.fakes.registration.forms.set('b.org', FORM);
    await askServer();
    fillWho('alice', 'short');
    expect(await screen.findByRole('alert')).toHaveTextContent('at least 8 characters');
    expect(deps.fakes.registration.submitted).toEqual([]);
  });

  it('focuses the username again when the name is taken', async () => {
    const { deps } = openCreateAccount();
    deps.fakes.registration.forms.set('b.org', FORM);
    deps.fakes.registration.taken.add('alice@b.org');
    await askServer();
    fillWho('alice', 'longenough');
    expect(await screen.findByRole('alert')).toHaveTextContent('Somebody already has this name');
    expect(screen.getByLabelText('Username')).toHaveFocus();
  });

  it('sends every extra field and lands in the main window on success', async () => {
    const { deps } = openCreateAccount();
    deps.fakes.registration.forms.set('b.org', FORM);
    await askServer(' B.org ');
    fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'a@b.org' } });
    fillWho('Alice', 'longenough');
    expect(await screen.findByRole('searchbox', { name: 'Search chats' })).toBeInTheDocument();
    expect(deps.fakes.registration.submitted).toEqual([
      {
        domain: 'b.org',
        values: { username: 'alice', password: 'longenough', email: 'a@b.org', ocr: 'abcd' },
      },
    ]);
    await waitFor(() => expect(deps.fakes.keychain.get('alice@b.org')).resolves.toBe('longenough'));
  });

  it('goes back from "Who?" to "Where?" and from there to the welcome screen', async () => {
    const { deps } = openCreateAccount();
    deps.fakes.registration.forms.set('b.org', FORM);
    await askServer();
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByRole('heading', { name: 'Where?' })).toBeInTheDocument();
    expect(screen.getByLabelText('Server')).toHaveValue('b.org');
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument();
  });
});
