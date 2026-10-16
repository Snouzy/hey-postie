/**
 * The interface on fakes, for screenshots (dev only, never in the app bundle). URL parameters:
 * `theme=dark|light`, `layout=bubbles|lines`, `density=compact|spacious`, `signin=1` to stay on
 * the sign-in screen, `click=Bob|Settings…` to click,
 * in order, the element named by each label (aria-label), else the deepest one whose text contains it.
 */
import { createCore, createFakeDependencies } from '@hey-postie/core';
import { App } from '@hey-postie/ui';
import '@hey-postie/ui/styles';
import { createRoot } from 'react-dom/client';

const params = new URLSearchParams(location.search);
const theme = params.get('theme');
if (theme) {
  // The app applies the stored choice (core/useTheme.ts), so store it rather than set the attribute.
  localStorage.setItem('hey-postie:theme', theme);
  document.documentElement.dataset.theme = theme;
}

// The appearance choices the app reads from storage (core/settings.ts).
for (const [param, key] of [
  ['layout', 'hey-postie:letters-layout'],
  ['density', 'hey-postie:density'],
] as const) {
  const value = params.get(param);
  if (value) localStorage.setItem(key, value);
}

// Screenshots catch the final state: no transition half way, no blinking caret.
const still = document.createElement('style');
still.textContent =
  '*, *::before, *::after { transition: none !important; animation: none !important; caret-color: transparent !important; }';
document.head.append(still);

const deps = createFakeDependencies();
const { roster, chat, room } = deps.fakes;
roster.seed(
  { jid: 'bob@example.org', name: 'Bob', presence: 'online', subscription: 'both' },
  { jid: 'alice@example.org', name: 'Alice', presence: 'away', subscription: 'both' },
  { jid: 'carol@example.org', name: 'Carol', presence: 'dnd', subscription: 'both' },
  { jid: 'dan@example.org', name: 'Dan', presence: 'offline', subscription: 'both' },
);
const at = (minute: number) => new Date(2026, 9, 16, 10, minute);
chat.receive({
  chatId: 'bob@example.org',
  fromJid: 'bob@example.org',
  body: 'Hi! Did the parcel arrive?',
  sentAt: at(1),
});
chat.receive({
  chatId: 'bob@example.org',
  fromJid: 'me@example.org',
  direction: 'out',
  status: 'read',
  body: 'Yes, this morning. Thanks a lot!',
  sentAt: at(2),
});
chat.receive({
  chatId: 'bob@example.org',
  fromJid: 'me@example.org',
  direction: 'out',
  status: 'delivered',
  encryption: 'omemo',
  body: 'A sealed letter, with a link https://example.org',
  sentAt: at(3),
  reactions: [{ emoji: '👍', fromJids: ['bob@example.org'], mine: false }],
});
chat.receive({
  chatId: 'bob@example.org',
  fromJid: 'bob@example.org',
  body: 'Perfect. Talk soon.',
  sentAt: at(4),
  reactions: [{ emoji: '❤️', fromJids: ['me@example.org'], mine: true }],
});
chat.receive({
  chatId: 'alice@example.org',
  fromJid: 'alice@example.org',
  body: 'Lunch tomorrow?',
  sentAt: at(5),
});
room.change({
  jid: 'hall@rooms.example.org',
  name: 'The hall',
  nick: 'me',
  joined: true,
  bookmarked: true,
  topic: 'Everything about the post office',
  notify: 'mentions',
  unreadCount: 3,
  mentionsCount: 1,
});
const hallLetter = (minute: number, nick: string, body: string, extra = {}) =>
  chat.receive({
    chatId: 'hall@rooms.example.org',
    kind: 'room',
    fromJid: `hall@rooms.example.org/${nick}`,
    fromNick: nick,
    body,
    sentAt: at(minute),
    ...extra,
  });
hallLetter(6, 'dan', 'Morning all! The *new* sorting machine is in, _finally_.');
hallLetter(
  7,
  'dan',
  'Notes from the visit:\n> it ~jams~ hums along\n```\nspeed: 4000 letters/h\n```',
  {
    reactions: [{ emoji: '🎉', fromJids: ['hall@rooms.example.org/me'], mine: true }],
  },
);
hallLetter(8, 'me', 'Great, I will try `sort --fast` this afternoon.', {
  direction: 'out',
  status: 'delivered',
  edited: true,
});
hallLetter(9, 'bob', 'Write-up here: https://example.org/sorting', {
  linkPreviews: [
    {
      url: 'https://example.org/sorting',
      title: 'How the new sorting machine works',
      description: 'Four thousand letters an hour, and a gentle touch for parcels.',
      siteName: 'Example Post',
    },
  ],
});
hallLetter(10, 'carol', '@me can you check this?', { isMention: true });

const core = createCore(deps);
const root = document.getElementById('root');
if (!root) throw new Error('No #root element');
createRoot(root).render(<App core={core} locale="en" version="preview" />);

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
function clickText(label: string) {
  const named = document.querySelector<HTMLElement>(`[aria-label="${label}"]`);
  if (named) {
    named.click();
    return true;
  }
  // Else the deepest element whose text contains the label: the click bubbles up to its handler.
  const all = [...document.body.querySelectorAll<HTMLElement>('*')].filter((el) =>
    el.textContent?.includes(label),
  );
  const target = all
    .filter((el) => ![...el.children].some((c) => c.textContent?.includes(label)))
    .at(0);
  target?.click();
  return Boolean(target);
}

async function run() {
  if (!params.get('signin')) {
    await wait(200);
    await core.accounts.signIn({ jid: 'me@example.org', password: 'x', remember: false });
  }
  for (const label of (params.get('click') ?? '').split('|').filter(Boolean)) {
    await wait(300);
    if (!clickText(label)) console.warn('[preview] nothing to click for', label);
  }
  await wait(400);
  document.body.dataset.previewReady = '1';
}
void run();
