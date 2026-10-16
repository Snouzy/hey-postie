import { act, fireEvent, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithCore, setupCore } from '../test-utils';
import { SendApproval } from './SendApproval';

function setup() {
  const { core } = setupCore();
  core.assistant.setSettings({ mode: 'readAndSend' });
  renderWithCore(<SendApproval />, core);
  return core;
}

const letter = { chatId: 'bob@x.org', title: 'Bob', body: 'On my way\nsee you' };

describe('SendApproval', () => {
  it('shows the recipient and the exact text, and sends on yes', async () => {
    const core = setup();
    let answer: Promise<boolean> = Promise.resolve(false);
    act(() => {
      answer = core.assistant.requestSend(letter);
    });
    expect(
      screen.getByRole('dialog', { name: 'Claude wants to send a letter' }),
    ).toBeInTheDocument();
    expect(screen.getByText('To Bob')).toBeInTheDocument();
    expect(screen.getByText(/On my way/)).toHaveTextContent('On my way see you');
    act(() => fireEvent.click(screen.getByRole('button', { name: 'Send' })));
    await expect(answer).resolves.toBe(true);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('counts a refusal or a closed dialog as no', async () => {
    const core = setup();
    let first: Promise<boolean> = Promise.resolve(true);
    let second: Promise<boolean> = Promise.resolve(true);
    act(() => {
      first = core.assistant.requestSend(letter);
      second = core.assistant.requestSend({ ...letter, body: 'Second' });
    });
    act(() => fireEvent.click(screen.getByRole('button', { name: 'Don’t send' })));
    await expect(first).resolves.toBe(false);
    // The second request waited in line and now shows.
    expect(screen.getByText('Second')).toBeInTheDocument();
    act(() => fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' }));
    await expect(second).resolves.toBe(false);
  });
});
