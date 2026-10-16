import { defineConfig } from 'astro/config';

/** Static site, no framework island, no third-party script. The domain is still to confirm. */
export default defineConfig({
  site: 'https://hey-postie.com',
  output: 'static',
  trailingSlash: 'always',
});
