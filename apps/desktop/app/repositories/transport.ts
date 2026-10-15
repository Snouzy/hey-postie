import { DomainError, type TransportRepository } from '@hey-postie/core';

/** Placeholder until the Rust relay lands (milestone 1). */
export class NotYetTransport implements TransportRepository {
  async websocketUrlFor(): Promise<string> {
    throw new DomainError('ServerUnreachable', 'ServerUnreachable: no transport yet');
  }
}
