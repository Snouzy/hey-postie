import { DomainError } from '../contracts/errors';

const LOCAL = /^[^@/\s]+$/;
const DOMAIN = /^[a-z0-9-]+(\.[a-z0-9-]+)*$/;

/** Trims, lower-cases local part and domain, keeps the resource as typed. */
export function normalizeJid(input: string): string {
  const trimmed = input.trim();
  const slash = trimmed.indexOf('/');
  const bare = slash === -1 ? trimmed : trimmed.slice(0, slash);
  const resource = slash === -1 ? '' : trimmed.slice(slash);
  const at = bare.indexOf('@');
  if (at <= 0) throw new DomainError('InvalidJid', `InvalidJid: ${describe(trimmed)}`);
  const local = bare.slice(0, at).toLowerCase();
  const domain = bare.slice(at + 1).toLowerCase();
  if (!LOCAL.test(local) || !DOMAIN.test(domain)) {
    throw new DomainError('InvalidJid', `InvalidJid: ${describe(trimmed)}`);
  }
  return `${local}@${domain}${resource}`;
}

export function domainOf(jid: string): string {
  const bare = jid.split('/')[0] ?? '';
  return bare.slice(bare.indexOf('@') + 1);
}

// Never log the JID itself: it identifies a person.
function describe(jid: string): string {
  return `${jid.length} characters`;
}
