# Edit and delete messages: design

_Written on 2026-10-16. Asked by the author the same day; built after the move to Tailwind
([2026-10-16-buzz-ui-tailwind-design.md](2026-10-16-buzz-ui-tailwind-design.md)), on 2026-10-16
(section 8)._

## 1. Goal

From a message's hover toolbar (and the keyboard), the user can:

| Action | Who | Protocol |
|---|---|---|
| Edit | my own text messages | XEP-0308, Last Message Correction |
| Delete for everyone | my own messages | XEP-0424, Message Retraction |
| Delete for me | any message | none: hidden on this device only |
| Remove from the hall | a moderator, on anyone's message in a hall | XEP-0425, Message Moderation |

## 2. What exists today (`main`, 2026-10-16)

- **Receiving** is half done. `repositories/converse/mappers.ts` already maps Converse's
  `retracted` and `edited` onto `Message.retracted` (body and attachments emptied) and
  `Message.edited`, with tests (`mappers.test.ts`).
- **The UI shows neither.** A corrected message shows its new text with no "edited" mark; a
  retracted one is an empty bubble.
- **Sending** does not exist: `ChatsService` has `send` and `toggleReaction` only.
- **The engine can do it all** (`@converse/headless` 14):
  - corrections through the `correcting` flag of a chat (`shared/model-with-messages.js:365-377`);
  - `retractOwnMessage` (`model-with-messages.js:417`, `plugins/muc/muc.js:860` for halls);
  - `retractOtherMessage(message, reason)` (`plugins/muc/muc.js:910`) for moderators.

## 3. Rules (service layer)

- **Edit**: only my own messages, with a body, not retracted, not pending or failed. The new body
  is trimmed; an empty one is refused with `EmptyMessage` (the user deletes instead). An unchanged
  body is a no-op. A sealed (OMEMO) message is corrected sealed; a plain one plain.
- **Delete for everyone**: only my own messages. In a hall, the message must carry the hall's
  stanza id (XEP-0359), otherwise `NotRetractable`. The message is replaced locally by the
  "deleted" placeholder at once.
- **Delete for me**: any message. Its id is added to a local hidden list, kept per account, so
  that history (MAM) cannot bring it back. Nothing is sent.
- **Remove from the hall**: only when my role is `moderator`; an optional reason (at most 140
  characters, trimmed). The server enforces it too; its refusal becomes `NotAllowed`.
- Retracted and hidden messages raise no notification, and a retraction that arrives after a
  notification does not change it (the OS has it already: one more reason why the sealed preview
  is off by default).
- **Logs**: message ids and the action only, never a body (AGENTS.md section 6).

## 4. Contracts (their own pull request, merged first)

```ts
// ChatsService
edit(chatId: string, messageId: string, body: string): Promise<Message>;
retract(chatId: string, messageId: string): Promise<void>;
hideForMe(chatId: string, messageId: string): Promise<void>;

// RoomsService
moderate(roomJid: string, messageId: string, reason?: string): Promise<void>;

// Message: one more field
retractedBy?: 'sender' | 'moderator';
```

New domain errors: `NotRetractable`, `NotAllowed`. A new persistence interface,
`HiddenMessagesRepository` (`hide(account, messageId)`, `isHidden(account, messageId)`), over the
local storage of the spec (IndexedDB), with a fake for tests. The chat repository gains the
matching methods over Converse; every service method has unit tests against fakes.

## 5. Interface (after Tailwind)

- **Hover toolbar** of a message, after React: "Edit" (mine), "Delete…" (a menu: "For me",
  "For everyone" on mine, "Remove from the hall…" for a moderator). Same toolbar in the bubbles and
  lines layouts. Model: Buzz `features/messages/ui/MessageActionBar.tsx` (layout only).
- **Editing happens in the composer**: it fills with the message, a kraft band above says
  "Editing" with a "Cancel" (Esc); Enter saves. **↑** in an empty composer edits my last message
  (Buzz `useRichTextEditor.ts:221-530`).
- **"edited"**: a small muted word next to the time, with the time of the last correction in its
  `title`.
- **Deleted**: the bubble keeps its place with Postie's sentence in muted italic: "Message deleted"
  or "Removed by a moderator" (+ the reason). Never an empty bubble.
- **Confirmation**: "Delete for everyone" and "Remove from the hall" confirm through a `Dialog`,
  with one plain sentence: the other side's app decides whether it applies (section 6).
- Texts in `en.ts` and `fr.ts`; [ui.md](../development/ui.md) and
  [design-system.md](../development/design-system.md) updated in the same commits.

## 6. Interoperability

- A retraction is a **request**: Conversations, Gajim, Monal and Dino apply it; Pidgin does not,
  so the message stays there. The confirmation says it plainly.
- XEP-0308 says a client SHOULD only correct its last message; some receivers apply a correction
  of an older one, some show it as a new message. See points to check.
- "Delete for me" is local: another device of the same account still shows the message.

## 7. Tests

- Core: every rule of section 3 against fakes (own vs other, empty body, pending, sealed edit stays
  sealed, moderator only, hidden list survives a history reload).
- Converse contract tests against the local test server (`tools/xmpp-server`): a correction and a
  retraction reach the other client; a moderation in a hall; a hidden message stays hidden after
  MAM.
- UI: the toolbar per case, ↑ to edit, Esc to cancel, the placeholders, the confirmations.

## 8. As built (2026-10-16)

- **Any of my letters can be edited**, not only the last one (the open point, decided while
  building: users expect it; some receivers may show a correction of an older letter as new).
- Core: `ChatsService.edit`, `retract`, `hideForMe`; `RoomsService.moderate` (moderator only,
  reason trimmed, 140 characters at most, `MAX_REASON_LENGTH`). Error codes `NotAllowed`,
  `NotRetractable`. `Message.retractedBy` and `moderationReason`. Event `message.hidden`.
- The hidden list is `HiddenMessagesRepository` (`contracts/repositories.ts`): an in-memory fake,
  and `apps/desktop/app/repositories/hiddenMessages.ts` over the window's local storage (ids only,
  per account), not IndexedDB: smaller, and ids are not secret.
- Converse: `correct` marks the model `correcting` then `sendMessage`; `retract` calls
  `retractOwnMessage` (a retracted letter stays displayable, Converse marks it ephemeral);
  `moderate` calls `retractOtherMessage` and turns a refusal into `NotAllowed`; the mapper reads
  `moderated: 'retracted'` and `moderation_reason`; `change:moderated` and `change:edited` are
  watched.
- UI: a "⋯" next to the React button in the bubble's hover toolbar (`MessageActions`, the actions
  by `actionsFor`), editing in the composer (a kraft band, Enter saves through `chats.edit`, Esc
  cancels, ↑ in an empty field edits my last letter), "edited" before the time, the deleted or
  removed letter in Postie's italic in its place, and `DeleteMessageDialog` for everyone and for
  the hall (with an optional reason).
- Tests: the rules in `services/editDelete.test.ts`, the mapper, `MessageActions.test.tsx`,
  `Composer.test.tsx` and the whole flow in `screens/EditDelete.test.tsx`.
- **Edit history**: `Message.versions` holds the earlier texts of a corrected letter, oldest first,
  from Converse's `older_versions` (also for corrections received); "edited" is then a button
  (`EditHistory`) that lists them with their time. Only what this device saw: a correction made
  before the history reached this device has no earlier text.
- **Against the real server** (`edit.contract.test.ts`, run with `pnpm test:contract` and the mkcert
  root in `NODE_EXTRA_CA_CERTS`, 2026-10-16): alice's correction reaches bob as a `<replace>` naming
  the first letter; her retraction reaches him as a `<retract>` naming it; bob's correction reaches
  alice as an edited letter with its earlier text. All three pass.
- Not yet: the MCP tools (`edit_message`, `retract_message`), and moderation against the server
  (its module is not enabled on the test server yet).

## Points to check

- Which messages can be edited: the last one only (XEP-0308, safest for interop) or any of mine
  (what Signal and WhatsApp users expect). The author decides.
- XEP-0425 on the test server: `tools/xmpp-server/prosody.cfg.lua` enables only `muc_mam` on
  `rooms.localhost`. Moderation needs Prosody's `muc_moderation` (a community module on older
  Prosody versions); check the installed version and add it to the config.
- How Converse 14 stores a correction of a sealed message (the plaintext of the new version).
