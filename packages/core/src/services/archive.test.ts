import { beforeEach, describe, expect, it } from 'vitest';
import { createCore } from '../container';
import type { Attachment, Message } from '../contracts/types';
import { createFakeDependencies } from '../fakes';
import { matches, webLinks } from './archive';

let deps: ReturnType<typeof createFakeDependencies>;
let core: ReturnType<typeof createCore>;

beforeEach(() => {
  deps = createFakeDependencies();
  core = createCore(deps);
});

const BOB = 'bob@x.org';

function fromBob(body: string, extra: Partial<Message> = {}): Message {
  return deps.fakes.chat.receive({ chatId: BOB, fromJid: BOB, body, ...extra });
}

function file(name: string, mimeType: string): Attachment {
  return { url: `https://up.x.org/${name}`, name, size: 10, mimeType, encryption: 'none' };
}

describe('searching a conversation', () => {
  it('finds letters ignoring case and accents, newest first, with the matched ranges', async () => {
    fromBob('Le café est prêt');
    fromBob('Rien à voir');
    fromBob('CAFE ce soir ?');
    const page = await core.archive.search(BOB, 'cafe');
    expect(page.items.map((hit) => hit.message.body)).toEqual([
      'CAFE ce soir ?',
      'Le café est prêt',
    ]);
    expect(page.items[1]?.ranges).toEqual([{ start: 3, end: 7 }]);
  });

  it('finds a letter by the name of its file', async () => {
    fromBob('', { attachments: [file('Facture-mars.pdf', 'application/pdf')] });
    const page = await core.archive.search(BOB, 'facture');
    expect(page.items).toHaveLength(1);
    expect(page.items[0]?.ranges).toEqual([]);
  });

  it('skips retracted letters and those hidden for me, and an empty query finds nothing', async () => {
    const hidden = fromBob('secret plan');
    fromBob('old plan', { retracted: true });
    await core.chats.hideForMe(BOB, hidden.id);
    expect((await core.archive.search(BOB, 'plan')).items).toEqual([]);
    fromBob('anything');
    expect((await core.archive.search(BOB, '   ')).items).toEqual([]);
  });

  it('goes on into the server archive with the cursor, until its start', async () => {
    const older = fromBob('ancient news');
    deps.fakes.chat.history(BOB, [{ ...older, id: 'a1', body: 'ancient news from the archive' }]);
    const first = await core.archive.search(BOB, 'news');
    expect(first.items.map((hit) => hit.message.id)).toEqual([older.id, 'a1']);
    expect(first.next).toBeUndefined();
  });
});

describe('collecting media, links and documents', () => {
  beforeEach(() => {
    fromBob('see https://example.org/a. and https://example.org/a', {
      linkPreviews: [{ url: 'https://example.org/a', title: 'A page' }],
    });
    fromBob('', {
      attachments: [file('cat.jpg', 'image/jpeg'), file('notes.pdf', 'application/pdf')],
    });
    fromBob('', { attachments: [file('clip.mp4', 'video/mp4')] });
  });

  it('lists pictures and videos, newest first', async () => {
    const page = await core.archive.collect(BOB, 'media');
    expect(page.items.map((item) => item.kind === 'media' && item.attachment.name)).toEqual([
      'clip.mp4',
      'cat.jpg',
    ]);
  });

  it('lists the other files as documents', async () => {
    const page = await core.archive.collect(BOB, 'document');
    expect(page.items.map((item) => item.kind === 'document' && item.attachment.name)).toEqual([
      'notes.pdf',
    ]);
  });

  it('lists each web link of a letter once, with the hall’s preview', async () => {
    const page = await core.archive.collect(BOB, 'link');
    expect(page.items).toHaveLength(1);
    expect(page.items[0]).toMatchObject({
      url: 'https://example.org/a',
      preview: { title: 'A page' },
    });
  });
});

describe('text helpers', () => {
  it('keeps web links only, without the sentence’s punctuation', () => {
    expect(webLinks('go to https://a.org/x), or xmpp:bob@x.org, or http://b.org.')).toEqual([
      'https://a.org/x',
      'http://b.org',
    ]);
  });

  it('maps a match back onto the original text, accents and all', () => {
    expect(matches('Éléphant et éléphant', 'elephant')).toEqual([
      { start: 0, end: 8 },
      { start: 12, end: 20 },
    ]);
    // A decomposed accent (e + combining acute) stays inside the range.
    expect(matches('café!', 'cafe')).toEqual([{ start: 0, end: 5 }]);
  });
});
