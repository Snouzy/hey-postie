import type { LinkPreview } from '../../contracts/types';

/**
 * Converse keeps the Open Graph metadata a hall fastened to a letter as `ogp_metadata`, a list of
 * `{ 'og:url', 'og:title', … }` objects, and only from the room's own JID
 * (`plugins/muc/muc.js` `handleMetadataFastening`, `shared/parsers.js` `getOpenGraphMetadata`).
 * Pure mapping: anything odd is dropped, a page without a title or a description is no preview.
 */
export function linkPreviewsOf(value: unknown): LinkPreview[] {
  if (!Array.isArray(value)) return [];
  const previews: LinkPreview[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') continue;
    const preview = toLinkPreview(item as Record<string, unknown>);
    if (preview && !previews.some((known) => known.url === preview.url)) previews.push(preview);
  }
  return previews;
}

function toLinkPreview(meta: Record<string, unknown>): LinkPreview | null {
  const url = text(meta['og:url']);
  if (!/^https?:\/\/\S+$/i.test(url)) return null;
  const title = text(meta['og:title']);
  const description = text(meta['og:description']);
  if (!title && !description) return null;
  const preview: LinkPreview = { url };
  if (title) preview.title = title;
  if (description) preview.description = description;
  const siteName = text(meta['og:site_name']);
  if (siteName) preview.siteName = siteName;
  // Pictures are fetched over https only (the file repository refuses anything else).
  const image = text(meta['og:image']);
  if (/^https:\/\/\S+$/i.test(image)) preview.imageUrl = image;
  return preview;
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}
