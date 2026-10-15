import type { TransportRepository } from '../contracts/repositories';

export class FakeTransport implements TransportRepository {
  async websocketUrlFor(domain: string): Promise<string> {
    return `ws://fake/${domain}`;
  }
}
