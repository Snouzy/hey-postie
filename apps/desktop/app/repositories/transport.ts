import { DomainError, type TransportRepository } from '@hey-postie/core';
import { invoke } from '@tauri-apps/api/core';
import { isTauri } from '../tauri';

/**
 * The URL of the local relay, `ws://127.0.0.1:<port>/xmpp/<token>`, from the Rust `relay_url`
 * command. The relay reads the XMPP domain from the first `<open to="…"/>` frame, so the URL is
 * the same for every domain and is asked once. In a plain browser (`pnpm app:dev`) there is no
 * relay: signing in fails with `ServerUnreachable` right away.
 */
export class TauriTransport implements TransportRepository {
  private url: Promise<string> | null = null;

  async websocketUrlFor(): Promise<string> {
    if (!isTauri()) {
      throw new DomainError(
        'ServerUnreachable',
        'ServerUnreachable: no relay outside the Tauri window',
      );
    }
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
