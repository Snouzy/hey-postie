import type { DomainError } from '../contracts/errors';
import type { TransportRepository } from '../contracts/repositories';

export class FakeTransport implements TransportRepository {
  failWith: DomainError | null = null;

  async websocketUrlFor(domain: string): Promise<string> {
    if (this.failWith) throw this.failWith;
    return `ws://fake/${domain}`;
  }
}
