import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { App } from './App';
import { setupCore } from './test-utils';

describe('App', () => {
  it('writes the language on the document, so screen readers pick the right voice', () => {
    const { core } = setupCore();
    window.localStorage.clear();
    render(<App core={core} locale="fr" />);
    expect(document.documentElement.lang).toBe('fr');
  });

  it('lets a stored language choice win over the system one', () => {
    const { core } = setupCore();
    window.localStorage.setItem('hey-postie:locale', 'en');
    render(<App core={core} locale="fr" />);
    expect(document.documentElement.lang).toBe('en');
    window.localStorage.clear();
  });
});
