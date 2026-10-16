import { type Core, DomainError } from '@hey-postie/core';

/** A tool result the model reads: plain text, `isError` when it should change course. */
export interface Answer {
  [key: string]: unknown;
  content: { type: 'text'; text: string }[];
  isError?: boolean;
}

export function answer(...lines: string[]): Answer {
  return { content: [{ type: 'text', text: lines.join('\n') }] };
}

export function refusal(sentence: string): Answer {
  return { ...answer(sentence), isError: true };
}

/** What to do next, per domain error. Never a message body: only codes and identifiers. */
const NEXT: Partial<Record<string, string>> = {
  AssistantNotAllowed:
    'Drafts are off for Claude in Hey Postie. Tell the user they can allow them in Settings › Claude.',
  EmptyMessage: 'The message is empty. Write some text.',
  StatusTooLong: 'The status is too long: 140 characters at most.',
  InvalidJid: 'That address is not a valid JID (name@server).',
  EncryptionUnavailable: 'This chat cannot be sealed: the contact has no device for it.',
};

/** Turns any failure into a sentence the model can act on. */
export function failure(error: unknown): Answer {
  if (error instanceof DomainError) {
    return refusal(NEXT[error.code] ?? `Hey Postie refused: ${error.code}.`);
  }
  return refusal('Hey Postie could not do it. Try again, or ask the user to check the app.');
}

/** The account must be online for anything to work. */
export function offline(core: Core): Answer | null {
  return core.accounts.current()?.state === 'online'
    ? null
    : refusal('Not signed in. Ask the user to open Hey Postie and sign in.');
}
