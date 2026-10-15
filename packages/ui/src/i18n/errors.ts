import { DomainError } from '@hey-postie/core';
import type { MessageKey } from './en';

const KNOWN: ReadonlySet<string> = new Set<MessageKey>([
  'error.InvalidJid',
  'error.InvalidCredentials',
  'error.ServerUnreachable',
  'error.CertificateInvalid',
  'error.KeychainUnavailable',
  'error.EmptyMessage',
  'error.Unknown',
]);

/** Postie's sentence for an error. Codes without a sentence yet fall back to `error.Unknown`. */
export function errorKey(error: unknown): MessageKey {
  if (error instanceof DomainError) {
    const key = `error.${error.code}`;
    if (KNOWN.has(key)) return key as MessageKey;
  }
  return 'error.Unknown';
}
