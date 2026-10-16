import { describe, expect, it } from 'vitest';
import { en, fr, pickLocale, t } from './index';

describe('pickLocale', () => {
  it('picks fr for fr-FR', () => {
    expect(pickLocale(['fr-FR', 'en'])).toBe('fr');
  });
  it('picks the first supported language in order', () => {
    expect(pickLocale(['de-DE', 'en-GB', 'fr'])).toBe('en');
  });
  it('falls back to en for an unknown language', () => {
    expect(pickLocale(['de-DE'])).toBe('en');
  });
  it('falls back to en for an empty list', () => {
    expect(pickLocale([])).toBe('en');
  });
});

describe('dictionaries', () => {
  it('have the same keys in both languages', () => {
    expect(Object.keys(fr).sort()).toEqual(Object.keys(en).sort());
  });
  it('never contain an empty text', () => {
    for (const dictionary of [en, fr]) {
      for (const [key, value] of Object.entries(dictionary)) {
        expect(value, key).not.toBe('');
      }
    }
  });
  it('t returns the French text', () => {
    expect(t('fr', 'welcome.signIn')).toBe('Se connecter');
  });
});

describe('French typography', () => {
  it('puts a non-breaking space before ; : ! ? and inside « »', () => {
    for (const [key, value] of Object.entries(fr)) {
      expect(value, key).not.toMatch(/ [;:!?»]|« /);
    }
  });
  it('uses typographic apostrophes', () => {
    for (const [key, value] of Object.entries(fr)) {
      expect(value, key).not.toContain("'");
    }
  });
});
