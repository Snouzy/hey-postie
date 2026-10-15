export type ErrorCode =
  | 'InvalidJid'
  | 'InvalidCredentials'
  | 'ServerUnreachable'
  | 'CertificateInvalid'
  | 'RegistrationUnsupported'
  | 'AccountConflict'
  | 'KeychainUnavailable'
  | 'FileTooLarge'
  | 'EmptyMessage'
  | 'EncryptionUnavailable'
  | 'Unknown';

/**
 * The only error type that crosses the service boundary. The message always starts with the
 * code so that logs and tests can match on it without reading the whole text.
 */
export class DomainError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message?: string,
    public override readonly cause?: unknown,
  ) {
    super(message ?? code);
    this.name = 'DomainError';
  }
}
