/** Vite's `import.meta.glob`, which vitest provides; the package has no `vite/client` types. */
type GlobMeta = {
  glob(pattern: string, options: { query: string; eager: true; import: 'default' }): unknown;
};

// Vite rewrites `import.meta.glob` only when it is written out with literals, hence two calls.
/** Every stylesheet of the package, by path relative to this file, as text. */
export const stylesheets = (import.meta as unknown as GlobMeta).glob('../**/*.css', {
  query: '?raw',
  eager: true,
  import: 'default',
}) as Record<string, string>;

/** Every component of the package, as text: the classes they use are read from it. */
export const components = (import.meta as unknown as GlobMeta).glob('../**/*.tsx', {
  query: '?raw',
  eager: true,
  import: 'default',
}) as Record<string, string>;

/** One file by its name (Vite keys the ones next to this file as `./name`). */
export function source(files: Record<string, string>, name: string): string {
  return Object.entries(files).find(([path]) => path.endsWith(`/${name}`))?.[1] ?? '';
}
