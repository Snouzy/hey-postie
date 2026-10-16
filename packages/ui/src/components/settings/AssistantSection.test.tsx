import { ASSISTANT_DEFAULT_PORT } from '@hey-postie/core';
import { act, fireEvent, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readAssistantSettings } from '../../core/settings';
import { renderWithCore, setupCore } from '../../test-utils';
import { AssistantSection, claudeCodeCommand } from './AssistantSection';

beforeEach(() => localStorage.clear());

function setup() {
  const { core } = setupCore();
  renderWithCore(<AssistantSection titleId="t" />, core);
  return core;
}

describe('AssistantSection', () => {
  it('starts off, and remembers the access the user picks', () => {
    const core = setup();
    expect(screen.getByRole('radio', { name: 'Off' })).toBeChecked();
    expect(
      screen.getByRole('checkbox', { name: 'Let Claude read sealed chats too' }),
    ).toBeDisabled();
    fireEvent.click(screen.getByRole('radio', { name: /prepare letters/ }));
    expect(core.assistant.getSettings().mode).toBe('readAndDraft');
    expect(readAssistantSettings().mode).toBe('readAndDraft');
  });

  it('refuses a port out of range with Postie’s sentence', () => {
    const core = setup();
    const field = screen.getByRole('textbox', { name: 'Port' });
    fireEvent.change(field, { target: { value: '80' } });
    fireEvent.blur(field);
    expect(screen.getByRole('alert')).toHaveTextContent('1024 and 65535');
    expect(core.assistant.getSettings().port).toBe(ASSISTANT_DEFAULT_PORT);
  });

  it('copies the Claude Code command with the port and the token, never showing the token', async () => {
    const core = setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    fireEvent.click(screen.getByRole('radio', { name: 'Read my chats' }));
    await act(async () =>
      fireEvent.click(screen.getByRole('button', { name: 'Copy the Claude Code command' })),
    );
    const token = await core.assistant.token();
    expect(writeText).toHaveBeenCalledWith(claudeCodeCommand(ASSISTANT_DEFAULT_PORT, token));
    expect(document.body.textContent).not.toContain(token);
  });
});
