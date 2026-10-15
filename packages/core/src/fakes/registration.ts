import { DomainError } from '../contracts/errors';
import type { RegistrationRepository } from '../contracts/repositories';
import type { RegistrationForm } from '../contracts/types';

/** In-memory registration. `forms` seeds what a domain asks for; `taken` lists used names. */
export class FakeRegistration implements RegistrationRepository {
  readonly forms = new Map<string, RegistrationForm>();
  readonly taken = new Set<string>();
  readonly submitted: Array<{ domain: string; values: Record<string, string> }> = [];
  readonly deleted: string[] = [];
  readonly wiped: string[] = [];
  currentJid: string | null = null;

  async form({ domain }: { domain: string; websocketUrl: string }): Promise<RegistrationForm> {
    const form = this.forms.get(domain);
    if (!form) throw new DomainError('RegistrationUnsupported');
    return form;
  }

  async submit({
    domain,
    values,
  }: {
    domain: string;
    websocketUrl: string;
    values: Record<string, string>;
  }) {
    if (this.taken.has(`${values.username}@${domain}`)) throw new DomainError('AccountConflict');
    this.submitted.push({ domain, values });
  }

  async deleteCurrent(): Promise<void> {
    if (!this.currentJid) throw new DomainError('Unknown', 'Unknown: no account signed in');
    this.deleted.push(this.currentJid);
  }

  async wipeLocal(jid: string): Promise<void> {
    this.wiped.push(jid);
  }
}
