import type { AssistantMode, AssistantSettings } from '@hey-postie/core';
import { type FormEvent, useEffect, useState } from 'react';
import { useCore, useText } from '../../core/CoreProvider';
import { writeAssistantSettings } from '../../core/settings';
import { errorKey } from '../../i18n/errors';
import { Button } from '../Button';
import { sectionStyles as styles } from './sectionStyles';

const MODES: readonly AssistantMode[] = ['off', 'read', 'readAndSend'];

/** What the user pastes in a terminal to connect Claude Code (spec 2026-10-16-mcp-design). */
export function claudeCodeCommand(port: number, token: string): string {
  return `claude mcp add --transport http hey-postie http://127.0.0.1:${port}/mcp --header "Authorization: Bearer ${token}"`;
}

/**
 * Claude's access: off, read only, or read and send with approval; sealed chats left out unless
 * included; the port; and the command that connects Claude Code. The token is never shown, only
 * copied. The rule lives in the core (`core.assistant`); this window remembers the choice.
 */
export function AssistantSection({ titleId }: { titleId: string }) {
  const core = useCore();
  const text = useText();
  const [settings, setSettings] = useState<AssistantSettings>(core.assistant.getSettings);
  const [port, setPort] = useState(String(settings.port));
  const [portError, setPortError] = useState<string | null>(null);
  const [status, setStatus] = useState('');

  useEffect(() => core.events.on('assistant.changed', setSettings), [core]);

  function change(update: Partial<AssistantSettings>) {
    writeAssistantSettings(core.assistant.setSettings(update));
  }

  function savePort(event: FormEvent) {
    event.preventDefault();
    try {
      change({ port: Number(port) });
      setPortError(null);
    } catch (error) {
      setPortError(text(errorKey(error)));
    }
  }

  async function copyCommand() {
    const token = await core.assistant.token();
    await navigator.clipboard.writeText(claudeCodeCommand(settings.port, token));
    setStatus(text('assistant.copied'));
  }

  async function replaceToken() {
    await core.assistant.newToken();
    setStatus(text('assistant.tokenReplaced'));
  }

  return (
    <div className={styles.section}>
      <h3 id={titleId} className={styles.title}>
        {text('settings.section.assistant')}
      </h3>
      <p className={styles.hint}>{text('assistant.intro')}</p>
      <fieldset className={styles.group}>
        <legend className={styles.heading}>{text('assistant.access')}</legend>
        {MODES.map((mode) => (
          <label key={mode} className={styles.radio}>
            <input
              type="radio"
              name="assistant-mode"
              checked={settings.mode === mode}
              onChange={() => change({ mode })}
            />
            {text(`assistant.mode.${mode}`)}
          </label>
        ))}
        <p className={styles.hint}>{text('assistant.privacy')}</p>
      </fieldset>
      <section className={styles.group} aria-labelledby={`${titleId}-sealed`}>
        <h4 id={`${titleId}-sealed`} className={styles.heading}>
          {text('assistant.sealedHeading')}
        </h4>
        <label className={styles.radio}>
          <input
            type="checkbox"
            checked={settings.includeSealed}
            disabled={settings.mode === 'off'}
            onChange={(event) => change({ includeSealed: event.target.checked })}
          />
          {text('assistant.includeSealed')}
        </label>
        <p className={styles.hint}>{text('assistant.includeSealedHint')}</p>
      </section>
      <section className={styles.group} aria-labelledby={`${titleId}-connect`}>
        <h4 id={`${titleId}-connect`} className={styles.heading}>
          {text('assistant.connect')}
        </h4>
        <form className={styles.row} onSubmit={savePort}>
          <label className="flex items-center gap-2">
            {text('assistant.port')}
            <input
              className="w-[90px] rounded-sm border border-line-strong bg-paper-raised px-2 py-1 font-mono text-[13px] text-ink focus-visible:border-navy"
              inputMode="numeric"
              value={port}
              onChange={(event) => setPort(event.target.value)}
              onBlur={savePort}
              aria-describedby={portError ? `${titleId}-port-error` : undefined}
            />
          </label>
        </form>
        {portError && (
          <p id={`${titleId}-port-error`} className="m-0 text-[13px] text-red" role="alert">
            {portError}
          </p>
        )}
        <div className={styles.row}>
          <Button disabled={settings.mode === 'off'} onClick={() => void copyCommand()}>
            {text('assistant.copyCommand')}
          </Button>
          <Button variant="danger" onClick={() => void replaceToken()}>
            {text('assistant.newToken')}
          </Button>
        </div>
        <p className={styles.hint}>{text('assistant.connectHint')}</p>
        <p className={styles.hint} aria-live="polite">
          {status}
        </p>
      </section>
    </div>
  );
}
