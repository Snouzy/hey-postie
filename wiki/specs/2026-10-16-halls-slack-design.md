# Halls the Slack way: create, invite, manage, show

_Written on 2026-10-16 from two research passes the same day (Buzz's channels, read in its
`desktop/src`; Converse 14 and Prosody 13.0.7 for XEP-0045 room management). Asked by the author:
"the adding, managing and display of a group, a bit like Slack", with Buzz as the model. Steps 1
and 2 built on 2026-10-16 (section 8)._

## 1. Goal

A hall (an XMPP group chat, XEP-0045) is created in two clicks, people are invited from the address
book, and it is managed from the hall itself, as a Slack or Buzz channel:

- the sidebar shows **Halls** and **Letters** (direct chats) as two foldable sections;
- **Create a hall**: a name, an optional description, Private (default) or Public;
- **Invite people**: search the address book or paste an address, several at once; the invited
  person sees an invitation to accept or decline;
- **The hall's panel**: its name and description (editable by owners), details, who is in it with
  their role and what can be done to them, the bell, and the actions (invite, leave, delete);
- **Browse halls**: search, join in one click, or create the one you searched for.

## 2. What XMPP changes from Slack

- **Address and name are two things.** The address before `@` is fixed and must be valid (lowercase,
  no spaces); the display name can change. The create dialog derives the address from the name
  (`Release notes` → `release-notes`), lets the user edit it, and checks it is free on the server.
  Renaming changes the name only.
- **Private means members-only with real addresses visible to members**: that is also what sealed
  (OMEMO) letters need in a hall, so private halls can be sealed.
- **An invitation is accepted, not imposed**: Buzz adds people silently; XMPP sends an invitation.
- **Who is "in" a hall**: occupants are the people present now; members of a private hall are a
  list the admins can read. The panel shows both: present first, then members who are away.
- **Roles**: owner > admin > member > none, and outcast (banned). Removing someone = kick + revoke
  membership; banning = outcast. No Slack "guest" or "time out".
- **No archive**: deleting (destroying) the hall is final, with a reason; the server keeps the name
  for 31 days (Prosody), so it cannot be taken again at once.
- **Read before joining** is not possible: joining stays the first step.

## 3. Rules (service layer)

- **Create**: name 1–64 characters, trimmed; the address localpart is `[a-z0-9._-]{1,64}`, derived
  from the name by default; refused with `RoomExists` when the server already knows it. Private:
  members-only, real addresses visible to members, not listed. Public: open, listed, real addresses
  visible to moderators only. Always persistent. The creator is owner and nick defaults to the
  account's name. The hall is bookmarked.
- **Configure** (owner only, `NotAllowed` otherwise): name, description, private/public.
- **Topic**: whoever the hall allows (moderators by default).
- **Invite**: any address list (each validated as a JID); a mediated invitation, so the server checks
  the right to invite and, in a private hall, grants membership.
- **People**: make admin / make member (owner), remove (admin: kick if present + revoke membership),
  ban (admin). Never on oneself; an owner cannot be demoted by an admin.
- **Delete** (owner only): optional reason; then the hall leaves the list and its bookmark goes.
- **Invitations received**: kept until accepted (join, bookmark) or declined (a decline is sent to
  the inviter through the hall). From a blocked contact: dropped. From a stranger: shown, marked.
- Logs: room JIDs and error codes only; never a name, topic, reason or invitation text.

## 4. Contracts (their own pull request first)

```ts
// types.ts
export interface RoomSettings {
  name: string;
  description: string;
  visibility: 'private' | 'public';
}
export type RoomAffiliation = 'owner' | 'admin' | 'member' | 'outcast' | 'none';
export interface RoomAffiliate { jid: string; nick?: string; affiliation: RoomAffiliation }
export interface RoomInvitation { roomJid: string; fromJid: string; reason?: string; password?: string }
// Room gains: visibility?: 'private' | 'public'; affiliation?: RoomAffiliation (mine)

// repositories.ts: a separate, small interface (AGENTS.md section 3)
export interface RoomAdminRepository {
  create(input: { service: string; localpart: string; nick: string; settings: RoomSettings }): Promise<Room>;
  settings(jid: string): Promise<RoomSettings>;
  configure(jid: string, change: Partial<RoomSettings>): Promise<void>;
  setTopic(jid: string, topic: string): Promise<void>;
  invite(jid: string, inviteeJid: string, reason?: string): Promise<void>;
  setAffiliation(jid: string, userJid: string, affiliation: RoomAffiliation, reason?: string): Promise<void>;
  kick(jid: string, nick: string, reason?: string): Promise<void>;
  affiliations(jid: string): Promise<RoomAffiliate[]>;
  destroy(jid: string, reason?: string): Promise<void>;
  onDestroyed(handler: (jid: string, reason?: string) => void): () => void;
}
export interface RoomInvitationRepository {
  onInvitation(handler: (invitation: RoomInvitation) => void): () => void;
  decline(invitation: RoomInvitation, reason?: string): Promise<void>;
}

// services.ts: RoomsService gains
create(input: { name: string; address?: string; description?: string; visibility: 'private' | 'public' }): Promise<Room>;
suggestAddress(name: string): string;
settings(jid: string): Promise<RoomSettings>;
configure(jid: string, change: Partial<RoomSettings>): Promise<void>;
setTopic(jid: string, topic: string): Promise<void>;
invite(jid: string, jids: string[]): Promise<void>;
people(jid: string): Promise<RoomPerson[]>; // present occupants and absent members, with roles
setRole(jid: string, userJid: string, change: 'admin' | 'member' | 'remove' | 'ban'): Promise<void>;
destroy(jid: string, reason?: string): Promise<void>;
invitations(): Promise<RoomInvitation[]>;
acceptInvitation(roomJid: string): Promise<Room>;
declineInvitation(roomJid: string): Promise<void>;
// events: 'room.invited' (RoomInvitation), 'room.destroyed' ({ jid, reason? })
// errors: RoomExists, NotAllowed (exists), RoomNotFound (exists)
```

## 5. Engine (Converse 14, Prosody 13.0.7)

- **Create**: `api.rooms.get(jid, { nick, hidden: true, auto_configure: true, roomconfig }, true)`;
  `roomconfig` keys `roomname`, `roomdesc`, `persistentroom`, `publicroom`, `membersonly`, `whois`.
  The room stays locked until configured, never open with defaults. Then send the same owner form
  ourselves through `api.sendIQ` and await it: Converse's own configuration error is never awaited
  (it would be an unhandled rejection). Disco#info first: found → `RoomExists`.
- **Configure / rename / description**: a partial owner form (`muc#owner`, `FORM_TYPE` + the fields).
- **Topic**: `room.setSubject(text)`; success is the echoed subject; a refusal is an error message.
- **Invite**: a mediated invitation (`<x muc#user><invite to=…/>`) sent to the room: the server
  checks rights and grants membership in a members-only room.
- **People**: `api.rooms.affiliations.set/get`, `room.setRole(occupant, 'none')` for kick.
- **Delete**: `room.sendDestroyIQ(reason)`. Converse does not notice a destroy while inside: our own
  handler watches the unavailable presence with `<destroy>`, closes the room and drops the bookmark,
  for the owner and for everyone else.
- **Invitations received**: `auto_join_on_invite: false`, `confirmDirectMUCInvitation` → false, and
  our own handler for both forms (`jabber:x:conference` and `muc#user/invite`), which gives the real
  inviter and password. Prosody's mediated invitation carries a body: the chats repository drops a
  message from a room address that holds an invite, so no stray direct chat appears.
- Known Converse slip: Prosody announces `muc_public`, Converse looks for `publicroom`: read
  `features.public`.

## 6. Interface (Buzz as the model, our tokens)

- **Sidebar** (Chats tab): two foldable groups, **Halls** and **Letters**, with the uppercase heading
  and chevron of `RequestList`; on heading hover a "+" (24px) opens the Add menu on halls (Create a
  hall, Browse halls). A private hall wears a small lock next to the `users` icon. Notify `none`:
  the row at 50% with a bell-off. Rows keep their two lines.
- **Invitations**: an "Invitations" group above Halls, like the requests group (yellow count): the
  hall's name, who invited, their reason; the hall screen in place of a conversation shows "Join" in
  `primary` and "Decline".
- **CreateRoom dialog** (480px): "Create a hall", one sentence on what a hall is; Name (focused,
  placeholder "Release notes"), Address (derived, monospace, `@service` shown after it), Description
  ("Optional"), the Private / Public switch with one hint each; "Create" (`primary`, "Creating…",
  not closable meanwhile); then the Invite dialog opens on the new hall.
- **InviteToRoom dialog**: a search field over the address book (and a pasted address), results with
  an "Add" per row, chosen people as chips, "Invite" in `primary`; "Already in this hall" grouped
  below.
- **Header**: the topic (one line; owners and allowed people click to edit in place), an outlined
  people button with the count (opens the panel on People), a "⋯" for the hall's settings.
- **Hall panel** (`RoomDetails`, restructured): top block (name 20px, description up to 6 lines,
  pencil on hover for owners → edit dialog), Details rows (address with copy, Private/Public,
  members count), People (present then away, role as small text, "⋯" per person: Make admin, Make
  member, Remove from the hall, Ban, each confirmed), the bell, Actions (Invite people, Leave the
  hall…, Delete the hall… for the owner, confirmed with the reason).
- **Browse halls** (`RoomBrowser`): a search filter, rows "name · N members · description", "Join"
  on hover that joins at once, and a pinned "Create the hall “query”" row.
- **A new hall's intro**: at the top of an empty hall, "This is the beginning of #name", its
  description, and an "Invite people" card.

## 7. Plan (one pull request each)

1. Contracts, services, fakes, tests (section 3 and 4).
2. Converse: create, configure, topic, invite, people, delete, the destroy watch, invitations
   received; contract tests on the local server (alice creates, invites bob, bob joins, alice makes
   him admin, removes him, deletes the hall).
3. Sidebar groups and the Create dialog.
4. Invite dialog and invitations received.
5. Hall panel and header.
6. Browse halls.

## 8. As built: steps 1 and 2 (2026-10-16)

- Core: `RoomAdminRepository` and `RoomInvitationRepository` (with fakes), the rules in
  `services/roomAdmin.ts` (spread into `RoomsService`), error codes `RoomExists` and
  `InvalidRoomName`, events `room.invited` and `room.destroyed`; tests in `services/halls.test.ts`.
- Converse: `repositories/converse/room-admin.ts` (create with `auto_configure` then our own awaited
  owner form, partial owner forms, mediated invitations, affiliations, kick, destroy, and the
  `<destroy>` watch) and `room-invitations.ts` (both kinds of invitation; the hall's seat kept as
  the inviter when the hall hides real addresses; Prosody's fallback body files a stray direct chat
  with the hall's address, closed as soon as it appears). `Room.visibility` and `affiliation` read
  from the room's features and our own occupant.
- Against the real server (`halls.contract.test.ts`, 5 cases, all passing): create configured before
  anyone enters and `RoomExists` on a taken address; invite (bob gets it from alice and enters the
  private hall as a member); admin, topic, member, kick (status 307); bob's invitation reaches alice
  with no stray chat; destroy reported once.

## Points to check

- Whether the account's server allows creating halls (Prosody `restrict_room_creation`); the error
  becomes `NotAllowed` with Postie's sentence.
- The member count in Browse costs one disco request per hall: shown when the server gives it.
