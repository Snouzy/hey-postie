# Inside a conversation, the Slack way

_Written from a study of Buzz's conversation screen (its `desktop/src`, read 2026-10-16) against
Hey Postie's, with what XMPP and Converse 14 offer for each point. Asked by the author: "the same
reverse-engineering as for halls, inside a hall or a conversation". Lot A built on 2026-10-17: see
[ui.md](../development/ui.md#inside-a-conversation) and
[converse.md](../development/converse.md#read-markers-xep-0333). Lot B items 8 to 10 built on
2026-10-17: see the same ui.md section and
[converse.md](../development/converse.md#replies-and-mentions). No new dependency._

## 1. What the study found in Hey Postie

- **The "read" stamp never shows.** `mappers.ts` only maps an outgoing letter to `pending`, `sent`
  or `delivered`; Converse 14 also stores incoming 1:1 read markers under the wrong key
  (`plugins/chat/model.js:210-232`).
- **Read markers go to every peer, with no setting.** `engine.ts` sends `received`, `displayed`
  and `acknowledged` (XEP-0333); Converse sends `displayed` when a chat is marked read.
- **A draft is lost on a chat switch**: the composer's text is local state and `Conversation` is
  keyed per chat.
- Converse already handles more than the contract exposes: replies (XEP-0461 and the quoted
  fallback, both ways), mention references sent from `@nick` in halls (XEP-0372), the first unread
  message (`first_unread_id`), server link previews in halls (`ogp_metadata`).
- Already better than Buzz on purpose: the edit history, deleted letters kept as a placeholder, the
  "mentions you" highlight, pasted images all sent, the topic edited in place.

## 2. Plan

**Lot A, quick wins (no new protocol)**

1. Drafts kept per chat (in memory for the session; never in storage: a draft may be sealed text).
2. Read markers: a setting "Tell others when I have read their letters" (on by default, as Signal
   and WhatsApp do), and the read stamp made true when the peer sends markers.
3. A sender's letters grouped only within 10 minutes; day labels with the weekday within a week.
4. Scrolled up: arrivals are held and counted, a "N new letters" / "Jump to the latest" pill brings
   the reader down; the user's own letter always snaps to the bottom.
5. Older letters load when the reader scrolls near the top (the button goes).
6. The hover toolbar gets three quick emojis (the user's most used, else 👍 ❤️ 😂) and "Copy text"
   in its menu.
7. `:shortcode:` emoji completion in the composer, after `:` and two characters.

**Lot B, medium**

8. A "New" divider above the first unread letter, as it was when the chat opened.
9. Quote-reply (XEP-0461 with the XEP-0428 fallback): Reply in the toolbar, a "Replying to X"
   banner above the composer, the quote in the letter that jumps to the original.
10. `@` mentions in halls: a member list while typing, chips in the text, Tab sending `@nick` so
    other clients see a real reference.
11. Text styling (XEP-0393): `*bold*`, `_italic_`, `~strike~`, `` `code` ``, code blocks, quotes;
    ⌘B / ⌘I / ⌘E wrap the selection. Our own renderer, never HTML.
12. Letters as lines in halls (decided in the Buzz spec), with a density setting.
13. Link previews in halls, only those the server attaches (never fetched by the reader, who would
    leak their address and reading time).

**Later**: read position synced across one's devices (XEP-0490, not in Converse), find in a
conversation (XEP-0431, server-dependent, or local), a thread panel (XEP-0201, little supported by
other clients: replies first), an image grid, joins and leaves collapsed in halls.

**Skipped**: pinned messages and message links (no XMPP standard), remind me later, a rich-text
editor (bodies are plain text).

Each item is its own pull request, with its tests and docs, shown live in a dev window.
