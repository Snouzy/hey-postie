# Read sync across devices, and search in a conversation

_Asked by the author on 2026-10-16: "synchronise reading between devices; search in a conversation,
the WhatsApp way, with links, media and documents". The "Later" items of
[the conversation spec](2026-10-17-conversation-slack-design.md) put first. No new dependency. The contract and the service of sections 2 to 4 are built
(`services/archive.ts`); a call looks at up to 200 letters._

## 1. Read sync across one's devices (XEP-0490, Message Displayed Synchronization)

_Built on 2026-10-16: `repositories/converse/read-sync.ts`, described in
[converse.md, "Read sync (XEP-0490)"](../development/converse.md#read-sync-xep-0490). The contract
test pairs the app with a hand-written second session of alice (Converse is one instance per
process), and also covers a hall._

**The problem.** Read a chat on the phone and Hey Postie still shows it unread, with its badge and
its notification. XEP-0333 `displayed` markers go to the *peer*; one's own other devices never learn
the position (and they do not leave at all when the author turns read markers off).

**The standard.** XEP-0490 keeps the read position in a private PEP node of one's own account,
`urn:xmpp:mds:displayed:0`: one item per chat, item id = the chat's bare JID, payload = the
`stanza-id` (XEP-0359) of the last letter displayed. Conversations, Monal, Gajim, Dino and Cheogram
speak it. Converse 14 does not: we add it in a repository module of our own.

- **Publish**: when a chat is marked read, publish its item with the stanza id of its newest letter,
  `by` = our bare JID in a direct chat, the room's JID in a hall. Publish options:
  `persist_items=true`, `max_items=max`, `send_last_published_item=never`, `access_model=whitelist`
  (only us). Independent of the "tell others when I have read" setting: this never leaves the
  account.
- **Receive**: announce `urn:xmpp:mds:displayed:0+notify` (XEP-0163) so the server pushes each new
  item to every device. When an item names a chat we hold, the letters up to that stanza id are
  read: the unread count drops to the number of incoming letters after it (zero in the usual case),
  the sidebar, the dock badge and the OS notification follow. We never re-publish what we received.
- **Catch up**: after sign-in (and resumption), fetch the node's items once and apply them, for
  reads done while Hey Postie was closed.
- **Servers without it**: no PEP publish-options feature → nothing is published or fetched,
  nothing breaks.
- Prosody 13 (`mod_pep`) supports `max_items=max` and `whitelist`; rooms need `muc_mam` for their
  stanza ids, which our test server has.

**Contract**: none. `markRead` and `onChatChange` already carry everything; this lives in
`repositories/converse/read-sync.ts`. A contract test opens two sessions of alice: one marks a chat
read, the other sees its unread count drop.

## 2. Search in a conversation

**What WhatsApp does**: "Search" in the chat's menu opens a field over the conversation; matches
are listed newest first with their date and a snippet, the up/down arrows walk them, choosing one
scrolls to the letter and flashes it.

**The server does not search for us.** Prosody's MAM has no full-text field (XEP-0431 is
ejabberd-only), and sealed letters can only be read on the device anyway. So the search is done here,
on the letters themselves:

1. first the letters already held (Converse keeps them in IndexedDB),
2. then, on "Search older letters", page backwards through the archive with
   `ChatsService.history` (50 a page), which never disturbs the open chat's scrolling, until the
   start of the archive or the user stops.

Matching ignores case and accents, looks in the body (not in quoted fallbacks) and in file names.
Retracted letters and those hidden "for me" never match.

**UI**: ⌘F (and "Search" in the chat's header menu) opens a bar above the letters; Enter / ↓ next,
⇧Enter / ↑ previous, Esc closes; "3 of 12" and a "Search older letters" link while the start is not
reached. Choosing a hit loads the pages up to it, scrolls to it and flashes it.

## 3. Media, links and documents

**What WhatsApp does**: in the contact's (or group's) info, "Media, links and docs" with a count,
opening three tabs: a grid of pictures and videos, a list of links with their preview, a list of
documents (name, size, date). Choosing an item shows it in the conversation.

**Ours**, in the Details / hall panel:

- **Media**: image and video attachments, as a grid of thumbnails (sealed ones decrypted on demand,
  as in the conversation; nothing is fetched for a letter the user did not let load, same rule as
  `autoLoad`). Clicking opens the image viewer.
- **Links**: the http(s) URLs of the bodies, newest first, with the server's preview when the
  letter carried one (halls); never fetched by us.
- **Documents**: every other attachment: name, size, sender, date; clicking downloads it.
- Built from the same pages as the search: what is held first, "Load older" for the rest.

## 4. Contract change (its own pull request, merged first)

In `contracts/services.ts`, a new `ConversationArchiveService`:

```ts
search(chatId: string, query: string, cursor?: ArchiveCursor): Promise<ArchivePage<SearchHit>>;
collect(chatId: string, kind: 'media' | 'links' | 'documents', cursor?: ArchiveCursor):
  Promise<ArchivePage<ArchiveItem>>;
```

`ArchivePage` = items newest first + `cursor` for the next older page, absent at the start of the
archive. Pure service code over `ChatRepository.messages`: no repository change.

## 5. Order of work

1. Contracts (this spec + the service interface and types).
2. Read sync (repository only), with its two-session contract test.
3. Search in a conversation (service + bar).
4. Media, links and documents (service + panel).

2 runs in parallel with 3 and 4: they touch different modules.
