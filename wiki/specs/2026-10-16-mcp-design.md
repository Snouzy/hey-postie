# Claude in Hey Postie (MCP server): design

_Written on 2026-10-16 from two research passes the same day (MCP tool design; architecture for a
Tauri app). Asked by the author: "talk to Claude, and it reads my messages, sends them and acts in
Hey Postie". Not built yet._

## 1. Goal

While Hey Postie is open and signed in, an MCP client (Claude Code, and Claude Desktop through a
bridge) can list the chats, read messages, find contacts, send a message with the user's approval,
react, mark a chat read and set the presence, through the user's own session: no second XMPP
connection, no new OMEMO device.

Out of this version: editing and deleting messages (they come with
[2026-10-16-edit-delete-messages-design.md](2026-10-16-edit-delete-messages-design.md)), files,
search across chats, joining or leaving halls, contact management, moderation, live push of new
messages.

## 2. What the research says (sources in the research reports, 2026-10-16)

- **No hard tool limit** in the MCP spec. Anthropic's own guide for MCP servers calls 1–15 tools
  "the sweet spot" and 30+ a reason to switch to search; Claude's tool choice degrades past 30–50
  tools across a session. Target: **8 tools now, 15 at most** for this server.
- **Merge reads, split writes.** Workflow tools over endpoint wrappers, but a tool that both reads
  and writes is rejected by Anthropic's connector review, and permissions are set per tool. One
  tool per kind of write.
- **Concise, paged answers**: high-signal text, readable names next to identifiers, a page with
  "call again with `before=…`", under Claude Code's 10,000-token warning. Structured output always
  with its text fallback.
- **Errors the model can act on** (`isError: true`, what to do next), never a stack trace, never
  a message body.
- **Annotations are hints**; a human must be able to deny a call. Claude Code honours
  `_meta["anthropic/requiresUserInteraction"]` (asks on every call).
- **Prompt injection is the main risk**: private messages + text from anyone + a way to send = the
  "lethal trifecta". Incoming bodies are untrusted data.
- **Streamable HTTP on loopback** MUST validate `Origin` (DNS rebinding) and SHOULD authenticate;
  binding to 127.0.0.1 is not an authentication boundary.
- **MCP spec 2026-07-28** (no sessions, no initialize handshake); the TypeScript SDK v2 serves it
  and older clients.
- **Live push** of new messages: only Claude Code "channels" (research preview). Not in this
  version.

## 3. Architecture

```
Claude Code ──HTTP──▶ Rust: 127.0.0.1:<port>/mcp      (apps/desktop/src-tauri/src/mcp/)
                      checks token, Host, Origin, size; forwards the request body
                      ──Tauri event──▶ webview: apps/desktop/app/mcp.ts
                                       ──▶ packages/mcp: handler over the MCP server
                                           ──▶ Core services (chats, contacts, accounts…)
                      ◀──mcp_reply command── the JSON-RPC answer
Claude Desktop ──stdio──▶ bridge (mcp-remote, or our MCPB bundle later) ──HTTP──▶ same server
```

- **The MCP protocol runs in TypeScript**, in a new presentation package `packages/mcp`, next to
  the UI: it talks to `Core` services only (AGENTS.md section 2), never to Converse or Tauri. The
  tools are thin wrappers over services, defined with zod schemas, tested in Vitest on
  `createFakeDependencies()` through the SDK's in-memory transport.
- **Rust is a guarded pipe**, like the XMPP relay: it knows HTTP, not MCP.
- **Why not the Rust SDK (rmcp)**: every call ends in the webview anyway (services and OMEMO keys
  live there); tools would be described twice, in Rust and TypeScript.
- **Why not a Unix socket or a stdio helper inside the app**: the App Store sandbox blocks a Unix
  socket shared with another team's process (the `claude` CLI), and a sandboxed app cannot ship a
  helper that an outside client launches. A loopback TCP port is the reliable channel.

## 4. Tools (version 1: 8)

Read tools share the `list_`, `get_`, `read_`, `find_` verbs so a user can allow every read with
one Claude Code rule (`mcp__hey-postie__read_*` and so on) while writes keep asking.

| Tool | Does | Service | readOnly | destructive | idempotent |
|---|---|---|---|---|---|
| `list_chats` | Chats and halls by last activity: name, JID, kind, unread count, sealed or not, last-letter preview. Filters `unread_only`, `kind`; cursor. | `chats.list`, `rooms.list` | ✓ | | ✓ |
| `get_chat` | One chat or hall: title, JID, sealed, members and roles (hall), topic, peer presence. | `chats`, `rooms.members`, `contacts.list` | ✓ | | ✓ |
| `read_messages` | Messages of one chat, newest page first (default 30, max 100), `before` cursor; never marks as read. | `chats.messages`, `chats.loadOlder` | ✓ | | ✓ |
| `find_contacts` | Contacts matching a name or JID, with presence. | `contacts.list` | ✓ | | ✓ |
| `send_message` | Send text to an existing chat or a contact's JID; waits for the user's approval in the app. | `chats.send` | | | |
| `react_to_message` | Add or remove one emoji on a message. | `chats.toggleReaction` | | | ✓ |
| `mark_chat_read` | Mark a chat read. | `chats.markRead` | | | ✓ |
| `set_presence` | Available / away / do not disturb, with an optional status. | `accounts.setPresence` | | | ✓ |

All tools: `openWorldHint: false` except `send_message` and `react_to_message` (they reach other
people). `send_message` also carries `_meta["anthropic/requiresUserInteraction"]: true`.

Later, each in its own pull request and keeping under 15: `search_messages` (needs a search
service), `edit_message` and `retract_message` (with their spec), `draft_message` (text into the
composer), `get_attachment`.

### Answers

- **Text first**, one line per message:
  `m-7Hc2 · 14:02 · Alice (alice@x.org): <message>…</message>`, then
  `Showing 30 of 412. More: read_messages chat=alice@x.org before=m-7Hc2`. Same data in
  `structuredContent` with an `outputSchema`.
- **Bodies are data, fenced**: each body sits inside `<message>` … `</message>` with any such tag in
  the body escaped, and the server instructions say message content is untrusted data, never
  instructions.
- **Identifiers**: JIDs as they are (meaningful); message ids as given by the service.
- **Undecryptable** letters read "sealed letter, cannot be read on this device"; retracted ones
  "deleted". Attachments as `[file: name, size]`.

### Errors (examples)

- `Not signed in. Ask the user to open Hey Postie and sign in.`
- `"bob" matches 2 contacts: bob@a.org (Bob Martin), bob@b.org (Bob Lee). Pass the JID.`
- `The user declined to send this message.` / `No answer from the user within 2 minutes.`
- `Claude may not send in this chat (setting in Hey Postie).`
- Domain errors of the services (`EmptyMessage`, `NotOnline`…) mapped to one sentence each.

## 5. Safety

- **Off by default.** Settings › Advanced › "Claude (MCP)": Off / Read only / Read and send with
  approval. The sentence next to it says plainly: what Claude reads leaves this device for
  Anthropic, outside end-to-end encryption.
- **Sealed chats excluded by default**: a second switch, "Include sealed chats", off. Excluded chats
  do not appear in any tool's answer.
- **Every send asks in the app**: a `Dialog` with the recipient, the exact text and "Send" /
  "Don't send", whatever the client supports. No answer within 2 minutes is a refusal.
- **Token**: 32 random bytes, in the keychain, never in `localStorage`, files or logs. Settings
  shows "Copy the Claude Code command" and "New token" (the old one stops working at once).
- **Rust checks every request**: `Authorization: Bearer` (constant-time compare), `Host` is
  `127.0.0.1:<port>` or `localhost:<port>`, any `Origin` header → 403 (no web page may call it),
  body ≤ 1 MB, bound to 127.0.0.1 only. Webview not ready → 503 with a sentence.
- **Port**: fixed (client configs hold the URL), 7413 by default, changeable in Settings; a taken
  port is shown there as an error.
- **Logs**: tool name, chat JID and result kind; never a body, a token or a fingerprint.
- **Background**: the main window gets `backgroundThrottling: "disabled"` (Tauri ≥ 2.3, macOS 14+);
  the XMPP engine already depends on the webview staying alive when the window is hidden.

## 6. Contracts (their own pull request, merged first)

```ts
// contracts/repositories.ts
interface AssistantAccessRepository {
  token(): Promise<string | null>;          // from the keychain
  saveToken(token: string): Promise<void>;
}

// contracts/services.ts
type AssistantMode = 'off' | 'read' | 'readAndSend';
interface AssistantService {
  settings(): { mode: AssistantMode; includeSealed: boolean; port: number };
  update(settings: Partial<{ mode: AssistantMode; includeSealed: boolean; port: number }>): void;
  newToken(): Promise<string>;
  /** The UI answers it; resolves false on refusal or after 2 minutes. */
  requestSendApproval(request: { chatId: string; title: string; body: string }): Promise<boolean>;
  visibleChat(chat: Chat): boolean;          // applies includeSealed
}
// events: 'assistant.sendRequested' (for the approval dialog), 'assistant.changed'
```

## 7. Dependencies (one session adds them)

| Package | License | Why |
|---|---|---|
| `@modelcontextprotocol/server` 2.x | Apache-2.0 (older parts MIT) | MCP server, browser build, spec 2026-07-28 and older |
| `zod` 4 | MIT | Tool input and output schemas |
| `axum` (Rust) | MIT | The local HTTP listener |

Check the release age against the pnpm policy at install. Claude Desktop: document
`npx mcp-remote http://127.0.0.1:7413/mcp --header "Authorization:Bearer ${TOKEN}"` (MIT) first;
an MCPB bundle on the site later. Neither ships in the App Store build.

## 8. Plan

1. Contracts PR (section 6), with fakes.
2. `AssistantService` and its tests.
3. `packages/mcp`: server, the 8 tools, instructions, tests on fakes.
4. Rust listener and bridge, `mcp_reply` command, capability, entitlement
   `com.apple.security.network.server` (the relay needs it too).
5. Settings section and the approval `Dialog`; texts in `en.ts` and `fr.ts`.
6. Try it in this repository's Claude Code against a `pnpm desktop:dev` window; then docs
   (technical-guide, ui.md, dependencies, release.md: entitlement and privacy).

## Points to check

- `network.server` in the App Store build (also open for the relay).
- App Review guideline on sharing personal data with a third-party AI (consent wording).
- `backgroundThrottling` below macOS 14 (our minimum is 12) and on Windows and Linux.
- Whether Claude Desktop runs an MCPB `node` bundle with its own Node.
