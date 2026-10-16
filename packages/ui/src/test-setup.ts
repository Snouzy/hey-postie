import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { clearDrafts } from './core/drafts';

// Drafts live in a module for the session: one test's text must not reach the next.
afterEach(clearDrafts);
