import { describe, expect, it } from 'vitest';
import { DomainError } from '../contracts/errors';
import { domainOf, normalizeJid } from './jid';

describe('normalizeJid', () => {
  it('lower-cases and trims', () => {
    expect(normalizeJid(' Alice@Example.org ')).toBe('alice@example.org');
  });
  it('keeps a resource', () => {
    expect(normalizeJid('alice@example.org/Postie')).toBe('alice@example.org/Postie');
  });
  it('refuses a missing domain', () => {
    expect(() => normalizeJid('alice')).toThrow(DomainError);
    expect(() => normalizeJid('alice')).toThrow(/InvalidJid/);
  });
  it('refuses spaces inside', () => {
    expect(() => normalizeJid('ali ce@example.org')).toThrow(/InvalidJid/);
  });
  it('refuses an empty local part', () => {
    expect(() => normalizeJid('@example.org')).toThrow(/InvalidJid/);
  });
});

describe('domainOf', () => {
  it('returns the domain', () => {
    expect(domainOf('alice@example.org/r')).toBe('example.org');
  });
});
