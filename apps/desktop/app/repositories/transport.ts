import { DomainError, type TransportRepository } from '@hey-postie/core';
import { invoke } from '@tauri-apps/api/core';

/**
 * The URL of the local relay, `ws://127.0.0.1:<port>/xmpp/<token>`, from the Rust `relay_url`
 * command. The relay reads the XMPP domain from the first `<open to="…"/>` frame, so the URL is
 * the same for every domain and is asked once. The command lands with the relay
 * (`feat/m1-relay`); until it exists, signing in fails with `ServerUnreachable`.
 */
export class TauriTransport implements TransportRepository {
  private url: Promise<string> | null = null;

  async websocketUrlFor(): Promise<string> {
    this.url ??= invoke<string>('relay_url');
    try {
      return await this.url;
    } catch (error) {
      this.url = null;
      throw new DomainError(
        'ServerUnreachable',
        'ServerUnreachable: the local relay is not available',
        error,
      );
    }
  }
}
