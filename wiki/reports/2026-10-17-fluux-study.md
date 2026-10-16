# Fluux Messenger, studied against Hey Postie

_Report of 2026-10-17. Source: a shallow clone of
[processone/fluux-messenger](https://github.com/processone/fluux-messenger) at its `main` of
2026-10-16 (v0.18.0 in `package.json`), read only. We take ideas, flows and protocol behaviour,
never code (see [decisions](../product/decisions.md), "Interface")._

Legend: **[code]** checked in the source; **[README]** / **[docs]** only claimed by its README or its
`docs/` folder, not checked.

## 1. What Fluux is

- **Who and how mature.** By ProcessOne, the makers of ejabberd. Repository created 2026-01-26,
  ~2,400 commits, 35 releases (latest v0.17.4 on 2026-09-16, a release every 1 to 4 weeks since June),
  442 stars, 31 forks, ~100 open issues. Practically one author: `mremond` wrote ~2,230 of the commits
  (the rest are bots and a handful of contributors). A `docs/superpowers/` folder (43 specs, plans,
  spikes) shows the same AI-assisted spec-then-plan process as ours. Pre-1.0, moving very fast.
- **Stack [code].** A monorepo with two packages: `packages/fluux-sdk` (`@fluux/sdk`, their own XMPP SDK)
  and `apps/fluux` (React, Vite, Tailwind, zustand, xstate, `@tanstack/react-virtual`, i18next,
  `openpgp`, `shiki` for code highlighting, `emoji-mart`). Desktop and mobile shell: **Tauri 2**, same as us.
- **How it talks XMPP [code].** Its own SDK on top of **xmpp.js** (`@xmpp/client`, `ltx`, `saxes`),
  with ~40 modules (`MAM`, `MUC`, `MUCVoice`, `Mds`, `Poll`, `Ignore`, `ConversationSync`, `Admin`,
  `Push`, `WebPush`...) and stores in IndexedDB (`idb`). The web build speaks WebSocket; on desktop a
  **Rust proxy** (`src-tauri/src/xmpp_proxy`, `tokio-rustls`, `hickory-resolver`, happy-eyeballs) bridges
  the WebView's WebSocket framing to native TCP with SRV lookup, direct TLS and STARTTLS. Same idea as
  our Rust relay.
- **Platforms [README].** Web (demo.fluux.io), macOS, Windows, Linux (deb, rpm, flatpak, AUR); iOS and
  Android in progress (`src-tauri/plugins/push`, `share-sheet`, `nse-openpgp`, `docs/IOS_DEVELOPMENT.md`).
- **Encryption [code].** **OpenPGP for XMPP (OX, XEP-0373/0374)**, not OMEMO. OMEMO stanzas are
  recognised only to show "encrypted with OMEMO, cannot read" (`core/e2ee/stanzaDecrypt.ts`). OMEMO is
  "planned" in `SUPPORTED_XEPS.md`; the long-term plan is MLS (`docs/STRATEGIC_REVIEW.md`).
- **Receipts and markers [code].** XEP-0184 and XEP-0333 are declared as namespaces but never sent;
  listed as "planned". Fluux shows no sent / delivered / read state.
- **Server features it relies on.** Mostly standard XEPs, degrading by disco (`docs/STRATEGIC_REVIEW.md`:
  "ejabberd-first in features, plain XMPP on the wire"). ejabberd-specific: Web Push `p1:push` (ejabberd
  Business Edition, web only), the upload-retention extension (`docs/XEP_HTTP_UPLOAD_RETENTION.md`,
  `urn:processone`, not implemented server-side yet), and an ejabberd admin panel driven by XEP-0050/0133
  ad-hoc commands (which Prosody's `mod_admin_adhoc` also answers). Custom Fluux namespaces, understood by
  no other client: polls `urn:fluux:poll:0`, mention-all `urn:fluux:mentions:0`, and private PEP nodes
  for appearance, conversation list, ignored users and verifications.

## 2. What Fluux has that we lack or do worse

Effort for us: S (a day or two), M (a week), L (more). Value is for one person using Hey Postie every
day at work against Prosody or ejabberd.

| Feature | XEPs | How Fluux behaves | Effort | Value | Prosody |
|---|---|---|---|---|---|
| **Search across all chats** [code: `searchStore.ts`, `SearchView.tsx`] | client-side, XEP-0313 search as a supplement | A sidebar Search view over a local IndexedDB inverted index, results in 300 ms; "search the server" on demand, deduplicated against local hits; filter pills (type, `in:` with autocomplete, "quoted phrase"); "Go to message" opens the chat at the hit, deep in history, with a short highlight. | M (index is the work; our jump-to-letter already exists) | **High**: "where did X say Y" is the daily question at work | Yes (client-side; MAM full-text search depends on server, Prosody has none by default) |
| **Bulk moderation** [code: `RoomBulkModerationModal.tsx`, `SpamModerationOption.tsx`] | XEP-0425 | Moderator filters loaded messages by sender or text, reviews the selection, removes them one by one with a pause; Stop / Retry; counts removed, failed, skipped. A "Spam" reason hides the whole row for everyone running Fluux (others keep a tombstone). | M | Medium (rare but painful when a hall is spammed) | Yes with `mod_muc_moderation` (community module) |
| **Whispers** (private message to an occupant) [code: `RoomView.tsx`, `MessageComposer.tsx`] | XEP-0045 §7.5 | "Whisper" from a member's menu; shown as a distinct private thread you reply to privately; attachments with a warning about server retention. | M | Medium (useful when the real JID is hidden; otherwise a DM is better) | Yes (room config may forbid PMs) |
| **Voice requests** [code: `MUCVoice.ts`, `RoomVoiceControls.tsx`] | XEP-0045 §8.6, `muc#request` form | In a moderated room a visitor sees "Request voice" instead of the composer; moderators get an actionable alert and a "Voice requests" list with Grant / Dismiss. | S-M | Low for small work halls; high for announcement-style halls | Likely yes (check on our local Prosody) |
| **Polls** [code: `Poll.ts`, `PollCreator.tsx`, `PollCard.tsx`] | custom `urn:fluux:poll:0` over XEP-0444 reactions + XEP-0428 fallback | Question, emoji options, single or multiple choice, deadline, live tallies, close with a results snapshot. Other clients see the fallback text and can vote with reactions. | M | Medium ("Friday or Monday?" is a daily thing in teams) | Yes (just messages); interop only with Fluux |
| **@all mention** [docs: `XEP-MENTION_ALL.md`] | XEP-0372 reference to the room JID + custom element, `@all` text fallback | Notifies everyone in a hall even if their bell is on "mentions only". | S | Medium | Yes |
| **Per-user ignore, synced** [code: `Ignore.ts`] | XEP-0223 private PEP, custom node | Mute one person in one room; their messages and replies to them are hidden and do not count as unread; synced across devices; keyed by occupant-id or real JID. | S-M | Low-medium | Yes (PEP) |
| **Per-room notification setting synced** [README] | XEP-0402 bookmark `<extensions/>` | "Mentions only / all messages" lives in the bookmark, so it follows the user to their other devices. Our bell is local. | S | Medium (a second device starts noisy) | Yes |
| **Conversation list sync** [docs: `XEP-CONVERSATION_SYNC.md`] | XEP-0223 private PEP, custom node | Open and archived 1:1 conversations follow the user between devices, merged on reconnect. | M | Medium once a user has two devices | Yes |
| **MAM catch-up with gap tracking** [code: `MAM.ts`; docs: `MAM_CATCHUP.md`] | XEP-0313, XEP-0059, XEP-0198 | After a reconnect, forward query `after=<last archive id>` per chat and room (2 at a time), holes recorded per conversation and healed later; rooms queried only after the join is confirmed by status 110. | M | **High**: missing letters after a laptop sleep is the worst bug a work messenger can have | Yes |
| **SASL2 + Bind2 + FAST** [code: `authentication.ts`, `fastTokenInvalidation.ts`] | XEP-0388, 0386, 0484 | Token reconnect without the password, inline resource bind and SM enable: faster resume after sleep. | M (Converse 14 has partial support; check) | Medium | Prosody 13 (verify which modules) |
| **Idle and auto-away** [README; XEP-0319 namespace in code] | XEP-0319, XEP-0012 | Away on system idle, back on activity; "last seen" for offline contacts, cached. | S-M (system idle from Rust) | Medium (colleagues know if you are at your desk) | Yes (`mod_lastactivity`) |
| **Contact's local time** [README; `EntityTime.ts` in code] | XEP-0202 | The contact's local time in the chat header and contact popover. | S | Medium for distributed teams | Yes (client to client) |
| **Sender-side link previews** [code: `useLinkPreview.ts`, `src-tauri/src/link_preview.rs`] | XEP-0422 fastening + OGP | The *sender's* app fetches Open Graph data (in Rust, off the main thread, no CORS) and fastens it to the message it just sent; readers never contact the site. | S-M | Medium: today we only show previews a hall attaches, so 1:1 chats and most Prosody halls show none | Yes. Must not be sent in clear for a sealed letter |
| **Command palette with actions** [code: `CommandPalette.tsx`, `ShortcutHelp.tsx`] | none | Cmd/Ctrl+K lists conversations, contacts, rooms **and actions**; a categorised shortcut help overlay (AZERTY aware). | S (our "Go to…" exists; add actions + help sheet) | Medium | n/a |
| **Room unread badge semantics** [README] | none | Grey count for ordinary unread, attention colour for mentions, separate `@N` marker; muted halls keep a grey badge. | S | Medium | n/a |
| **Admin panel** [code: `Admin.ts`, `components/admin/`] | XEP-0050, 0004, 0133 | Server admins manage users, stats, announcements from the app. | L | Low for our user | Yes (`mod_admin_adhoc`) |
| **Hats** [code: `RoomHatsModal.tsx`] | XEP-0317 | Role badges in the occupant list and on messages. | M | Low | Partial |
| **Themes synced, 34 languages, reading width** [README] | XEP-0223 | 14 themes, custom CSS, preferences stored in PEP. | M | Low | Yes |

## 3. What Hey Postie does better or differently

- **OMEMO**, the encryption Conversations, Gajim, Monal and Dino speak. Fluux's OX talks to almost no
  other client and cannot read OMEMO letters. For a work user whose colleagues use other apps, we win.
- **Read markers (XEP-0333) and receipts (XEP-0184)**: we show delivered and read; Fluux shows nothing.
- **Account creation and deletion** in the app (App Store rule); Fluux lists onboarding and registration
  as a gap in `docs/STRATEGIC_REVIEW.md`.
- **MCP for Claude**: we have 8 tools, sending through approval and drafts into the composer; Fluux's
  (`docs/MCP.md`) has 3 tools (`list_conversations`, `get_history`, `send_message` at 10/min), no
  per-conversation allowlist, and hands decrypted history to the client.
- **Privacy defaults**: images auto-load only from known people, readers never fetch link previews,
  drafts never written to disk, sealed-letter text out of notifications.
- **Engine we do not maintain**: Converse headless is shared with other projects; Fluux carries a
  40-module SDK by essentially one author. In exchange Fluux controls message identity and MAM finely.
- **Search in a conversation with a hit preview and "search older"**, and the media / links / documents
  panel: Fluux has find-on-page and global search but no media panel that we found.
- **Simple three-layer architecture** with fakes; Fluux's stores and machines are far bigger.

## 4. Top 8 recommendations, in order

1. **Reliable catch-up after sleep (MAM forward query from the last archive id, gaps recorded).**
   Missing letters is the one failure a work messenger cannot afford; read `docs/MAM_CATCHUP.md` first.
2. **Search across all chats**, a sidebar view reusing our jump-to-letter and hit preview.
   A local index of what Converse already cached, then MAM per chat on demand.
3. **Sender-side link previews for unsealed letters** (fetched in Rust, fastened with XEP-0422).
   1:1 chats and Prosody halls show previews without any reader leaking their address.
4. **Sync the hall bell in the XEP-0402 bookmark**, and add an `@all` mention that rings it.
   Small, and it stops a second device from being noisy or silent.
5. **Auto-away on system idle (XEP-0319) and "last seen" (XEP-0012)**, plus the contact's local time
   (XEP-0202) in the header. Cheap presence signals that colleagues rely on.
6. **Unread badge semantics for halls**: grey count, attention colour and `@N` for mentions,
   grey when muted. Decide the rule once in the core, show it in the sidebar.
7. **Polls in halls**, as letters plus reactions with a readable fallback, so any client can vote.
   Use XEP-0444 reactions only; treat Fluux's namespace as one possible wire format to stay compatible with.
8. **Moderation tools for halls**: voice requests (Grant / Dismiss), then bulk removal with review,
   Stop and Retry. Needed the day a public hall gets spam; check `mod_muc_moderation` on Prosody.

Later or no: whispers (a DM is clearer when the address is known), hats, admin panel, theme gallery.

## 5. XMPP edge cases documented in Fluux's `docs/`

Paths are relative to the Fluux repository. "ejabberd" marks server-specific behaviour.

- `docs/MESSAGE_IDENTIFIERS.md` §2: a message can carry two `<stanza-id>`, one by our server and one by
  the room; pick by `by=` (own bare JID in 1:1, room JID in MUC). The wrong one as an RSM cursor
  gives `item-not-found`.
- Same file §2: "first stanza-id found" is fine for dedup, wrong for paging and for references;
  moderation must target the id the room stamped.
- Same file §3: dedup order stanza-id, then origin-id, then `from`+`id`, keyed per room; two copies
  with different occupant-ids (XEP-0421) are never merged.
- Same file §3: a room message that matches only on `from`+`id` without a delay and not from us is a
  new message, not a copy (a newcomer on a reused nick must not inherit old state).
- Same file §4: nicks are reused after someone leaves, so anchors, the "New" line and read pointers
  must hold occupant-id and stanza-id, not a nick or a client id.
- Same file §5: replies, reactions and retractions reference the stanza-id in a room and the message
  `id` in 1:1; MUC private messages are `no-store`, so they use the origin-id.
- Same file §2 and §6: an archive id can vanish when the server purges it; on `item-not-found` for
  `after=`, resume by timestamp. Our own 1:1 sends may never get a stanza-id, so their read pointer
  stays local.
- Same file §3: an incoming `<retract>` may name any id tier; keep retracted ids, since the retraction
  can arrive before its target. Moderator retractions must come from the bare room JID.
- `docs/MAM_CATCHUP.md` §2: **ejabberd** does not implement the XEP-0313 `ids` field; fetching one
  message by id needs one-item RSM pages. `docs/XEP-POLL_PROTOCOL.md` §5.7 hits the same gap.
- `docs/2026-07-17-mam-catchup-roadmap.md` R7: `<fin stable='false'>` means pages may shift;
  **ejabberd** never sends it, other servers may. Never close a gap on an unstable result.
- `docs/superpowers/specs/2026-07-15-mam-discontinuity-safety-net-design.md`: never infer a gap from
  timestamps (quiet periods look the same; **ejabberd** archive ids are not sequential); record a hole
  when a "fetch latest" lands above held history.
- `docs/MAM_CATCHUP.md` §2: catch up with `after=<archive id>`, fall back to `start=<timestamp>`; an
  incomplete walk never proves coverage.
- `docs/MAM_CATCHUP.md` §4-5 and `docs/superpowers/specs/2026-07-27-room-mam-after-join-design.md`:
  query a room's MAM only after self-presence (status 110) confirms the join; after a successful SM
  resume, skip rooms already caught up.
- `docs/2026-06-25-empty-message-guard-and-chat-marker-display.md`: decide emptiness after stripping
  XEP-0428 fallbacks; XEP-0333 `<displayed>` in rooms have no body and must not become blank rows.
- `docs/superpowers/specs/2026-07-06-muc-catchup-read-state-design.md`: the XEP-0490 pointer only moves
  forward, so a wrong advance is permanent; debounce publishes, ignore our own PEP echo, and never let
  unread counting move the pointer.
- `docs/superpowers/specs/2026-06-29-mds-sync-marker-first-open-design.md`: apply a synced marker to
  the "New" line only on the first open of a chat per session.
- `docs/MAM_CATCHUP.md` §2: a marker whose message is missing locally and in the archive stays pending
  until the server proves it absent.
- `docs/superpowers/specs/2026-07-07-muc-nick-whitespace-impersonation-design.md`: **ejabberd** accepts
  leading/trailing spaces and invisible characters in nicks ("admin " impersonates "admin"); show the
  padding, never trim.
- `docs/XEP-CONVERSATION_SYNC.md` §4.2: never publish a full-replacement PEP list before the server
  copy has been fetched once in the session.
- `docs/XEP_HTTP_UPLOAD_RETENTION.md`: a `no-store` hint does not delete the uploaded file; warn
  before sending a file in a private context.

Not documented there: XEP-0425 v0 versus v1 broadcasts in detail, voice-request forms, affiliation
lists. `docs/xmpp-specifications/` is a draft connection-lifecycle contract, not wire edge cases.
