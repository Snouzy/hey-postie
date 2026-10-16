# Marketing site (hey-postie.com)

The public site of Hey Postie: a static Astro site, no framework island, no third-party script,
no font from a network. Skeleton created on 2026-10-16.

## Run it

From the repository root:

```sh
pnpm site:dev     # http://localhost:4321
pnpm site:build   # writes apps/site/dist/ (about 2 s)
```

`pnpm build`, and so `pnpm verify`, build the site along with the app. `pnpm check` type-checks
the dictionaries (`tsc --noEmit`); the `.astro` templates are checked by the build.

## Pages

| English | French | Source |
|---|---|---|
| `/` | `/fr/` | `src/components/Home.astro` |
| `/privacy/` | `/fr/confidentialite/` | `src/components/Privacy.astro` |
| `/releases/latest.json` | same | `public/releases/latest.json`, read by the app's updater (see `wiki/product/release.md`) |

Each file in `src/pages/` is one route and only picks the language of a shared component. The
routes of both languages are listed once in `src/i18n/index.ts` (`ROUTES`), which feeds the
language switch and the `hreflang` links.

## Texts

Every sentence lives in `src/i18n/en.ts` and `src/i18n/fr.ts`, never inline in a template. The
French dictionary is typed against the English keys, so a missing key fails `pnpm check`. The
voice and the glossary are in `wiki/product/brand.md`.

## Design

`src/styles/global.css` imports the app's tokens and fonts from `packages/ui/src/theme/` through a
relative path: the site follows the "Postal" design system without a copy, and Vite bundles the
four font files into `dist/_astro/`. Light and dark follow `prefers-color-scheme`; reduced motion
is honoured by the tokens. Postie is the `waving` pose of `packages/ui/src/illustrations/Postie.tsx`,
inlined by hand in `src/components/Postie.astro` (the site imports no React).

## Placeholders to confirm by the author

- The domain `hey-postie.com` (`site` in `astro.config.mjs`, the `hreflang` links, `latest.json`).
- The source code URL (`SOURCE_URL` in `src/layouts/Base.astro`).
- The download links under `/releases/latest/` and the artifact names in `latest.json`: no file
  exists yet, and the signatures are `PLACEHOLDER`.
- The hosting, so that the privacy page's sentence about the server stays true.
