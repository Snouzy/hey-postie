import { describe, expect, it } from 'vitest';
import { linkPreviewsOf } from './link-previews';

/** What Converse stores after a hall fastened Open Graph metadata to a letter (a fixture: the
 * local Prosody has no mod_ogp). */
const github = {
  'og:url': 'https://github.com/conversejs/converse.js',
  'og:title': 'conversejs/converse.js',
  'og:description': 'Web-based XMPP/Jabber chat client',
  'og:site_name': 'GitHub',
  'og:image': 'https://opengraph.githubassets.com/1/conversejs/converse.js',
  'og:type': 'object',
};

describe('linkPreviewsOf', () => {
  it('maps the page, its title, description, site name and picture', () => {
    expect(linkPreviewsOf([github])).toEqual([
      {
        url: 'https://github.com/conversejs/converse.js',
        title: 'conversejs/converse.js',
        description: 'Web-based XMPP/Jabber chat client',
        siteName: 'GitHub',
        imageUrl: 'https://opengraph.githubassets.com/1/conversejs/converse.js',
      },
    ]);
  });

  it('keeps a page with a description only, and trims the texts', () => {
    expect(
      linkPreviewsOf([{ 'og:url': 'http://x.org/a', 'og:description': '  About a  ' }]),
    ).toEqual([{ url: 'http://x.org/a', description: 'About a' }]);
  });

  it('drops a page with neither title nor description', () => {
    expect(
      linkPreviewsOf([{ 'og:url': 'https://x.org', 'og:image': 'https://x.org/i.png' }]),
    ).toEqual([]);
  });

  it('drops anything but an http(s) page, and a picture that is not https', () => {
    expect(linkPreviewsOf([{ ...github, 'og:url': 'javascript:alert(1)' }])).toEqual([]);
    expect(linkPreviewsOf([{ ...github, 'og:url': 'xmpp:bob@x.org' }])).toEqual([]);
    const [plainImage] = linkPreviewsOf([{ ...github, 'og:image': 'http://x.org/i.png' }]);
    expect(plainImage?.imageUrl).toBeUndefined();
    const [dataImage] = linkPreviewsOf([{ ...github, 'og:image': 'data:image/png;base64,AAAA' }]);
    expect(dataImage?.imageUrl).toBeUndefined();
  });

  it('keeps one preview per page, in order', () => {
    const other = { 'og:url': 'https://x.org', 'og:title': 'X' };
    expect(linkPreviewsOf([github, other, github]).map((preview) => preview.url)).toEqual([
      github['og:url'],
      'https://x.org',
    ]);
  });

  it('reads nothing odd: no list, items that are not objects, values that are not strings', () => {
    expect(linkPreviewsOf(undefined)).toEqual([]);
    expect(linkPreviewsOf({ 'og:url': 'https://x.org' })).toEqual([]);
    expect(linkPreviewsOf([null, 'https://x.org', 3])).toEqual([]);
    expect(linkPreviewsOf([{ 'og:url': 'https://x.org', 'og:title': 42 }])).toEqual([]);
  });
});
