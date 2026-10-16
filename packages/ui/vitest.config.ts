import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test-setup.ts'],
    // No stylesheet is processed (class names come from a proxy); a `?raw` import still reads
    // the text, for the tests that check the stylesheets themselves (`theme/layers.test.ts`).
    css: { include: [/[?&]raw\b/] },
  },
});
