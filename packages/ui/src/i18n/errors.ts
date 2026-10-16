import { DomainError, type ErrorCode } from '@hey-postie/core';
import type { MessageKey } from './en';

// Typed so that a new ErrorCode in the contracts fails the build until it has its sentence.
const SENTENCES: Record<ErrorCode, MessageKey> = {
  InvalidJid: 'error.InvalidJid',
  InvalidCredentials: 'error.InvalidCredentials',
  ServerUnreachable: 'error.ServerUnreachable',
  CertificateInvalid: 'error.CertificateInvalid',
  RegistrationUnsupported: 'error.RegistrationUnsupported',
  AccountConflict: 'error.AccountConflict',
  KeychainUnavailable: 'error.KeychainUnavailable',
  FileTooLarge: 'error.FileTooLarge',
  EmptyMessage: 'error.EmptyMessage',
  EncryptionUnavailable: 'error.EncryptionUnavailable',
  InvalidNick: 'error.InvalidNick',
  RoomPasswordRequired: 'error.RoomPasswordRequired',
  RoomNotFound: 'error.RoomNotFound',
  RoomBanned: 'error.RoomBanned',
  NickTaken: 'error.NickTaken',
  DeviceNotFound: 'error.DeviceNotFound',
  RegistrationRejected: 'error.RegistrationRejected',
  AccountCreatedSignInFailed: 'error.AccountCreatedSignInFailed',
  StatusTooLong: 'error.StatusTooLong',
  AssistantNotAllowed: 'error.AssistantNotAllowed',
  InvalidPort: 'error.InvalidPort',
  NotAllowed: 'error.NotAllowed',
  NotRetractable: 'error.NotRetractable',
  Unknown: 'error.Unknown',
};

/** Postie's sentence for an error. Anything that is not a DomainError reads as `Unknown`. */
export function errorKey(error: unknown): MessageKey {
  return error instanceof DomainError ? SENTENCES[error.code] : 'error.Unknown';
}
