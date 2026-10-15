import type { FakeDependencies } from '@hey-postie/core';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { App } from '../App';
import { setupCore } from '../test-utils';

export const BOB = 'bob@x.org';
export const HALL = 'hall@rooms.x.org';
export const FINGERPRINT = 'abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789';
export const FORMATTED = 'ABCDEF01 23456789 ABCDEF01 23456789 ABCDEF01 23456789 ABCDEF01 23456789';
export const OTHER = FINGERPRINT.replace(/a/g, 'f');
export const OTHER_FORMATTED = FORMATTED.replace(/A/g, 'F');

export async function signedIn(before: (deps: FakeDependencies) => void = () => {}) {
  const { deps, core } = setupCore();
  before(deps);
  render(<App core={core} locale="en" />);
  await act(() => core.accounts.signIn({ jid: 'alice@x.org', password: 'pw', remember: false }));
  return { deps, core };
}

/** A direct chat with `jid`, open on screen. */
export async function withChat(
  deps: FakeDependencies,
  jid = BOB,
  body = 'hello',
  encryption?: 'undecryptable',
) {
  act(() => {
    deps.fakes.chat.receive({ chatId: jid, fromJid: jid, body, ...(encryption && { encryption }) });
  });
  const name = jid.split('@')[0] ?? jid;
  fireEvent.click(await screen.findByRole('button', { name: new RegExp(name) }));
  return screen.getByRole('region', { name });
}

/** A promise the test resolves by hand, to hold a fake answer back. */
export function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
