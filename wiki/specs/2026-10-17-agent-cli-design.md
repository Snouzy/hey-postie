# `postie`, a command line for AI agents: design

_Written on 2026-10-17 with the author. Model: the `buzz` CLI of block/buzz (`crates/buzz-cli`,
read on 2026-10-17): "JSON in, JSON out", JSON errors on stderr, fixed exit codes, a `SKILL.md`
that teaches agents the commands. Ideas taken, no code._

## 1. Goal

An agent that has a shell but no MCP client (or one that prefers commands to tools) reads and acts
in Hey Postie with `postie chats list`, `postie messages list <chat>`, `postie messages draft <chat>
--text …`. Same reach, same rules as the MCP endpoint
([2026-10-16-mcp-design.md](2026-10-16-mcp-design.md)): nothing more.

## 2. Decisions (2026-10-17)

- **Through the running app, never to the XMPP server.** `postie` is a thin MCP client of the local
  endpoint (`http://127.0.0.1:<port>/mcp`, token, Host and Origin guard). Each command is one
  `tools/call` of an existing tool: the tools, their rules, the permission levels (off / read /
  read and draft / read, draft and send), sealed chats and the OMEMO keys stay in one place, the
  app. Nothing is described twice: the CLI knows the tool names and argument names, the app
  validates the values. App closed or assistant off: a JSON error, exit code 2.
- **A small Rust binary**, `apps/cli` (crate `postie`), its own crate outside the Tauri one: no
  Node on the user's machine, a ~1 MB binary that can ship next to the app later (Tauri sidecar).
  Its only dependency is `serde_json` (MIT or Apache-2.0, already used by the app). Argument
  parsing and the HTTP/1.1 request are written by hand: one table of commands, one loopback POST
  with `Content-Length` and `Connection: close`. No `clap`, no HTTP client crate.
- **Finding the endpoint.** When the assistant is on, the app writes
  `<app data dir>/mcp-endpoint.json` (`{"url", "token"}`), mode 0600, and removes it when the
  assistant goes off or the app quits (only if it still names its own port, so a second dev
  window does not delete the first one's file). The app data dir is Tauri's: `~/Library/Application
  Support/com.snouzylabs.heypostie` on macOS, `$XDG_DATA_HOME` (or `~/.local/share`) on Linux,
  `%APPDATA%` on Windows. `POSTIE_MCP_TOKEN` (with `POSTIE_MCP_URL`, default
  `http://127.0.0.1:7413/mcp`) overrides the file. The CLI refuses any host but `127.0.0.1` and
  `localhost` (the token must not leave the machine) and never prints the token.
  - _This is an exception to "secrets never in files" (AGENTS.md section 6), decided with the
    author:_ the token exists to be handed to local clients (Claude Code already keeps it in plain
    text in its own config), the file is readable by the user only, exists only while the
    assistant is on, and "New token" in Settings rewrites it. Reading the keychain from the CLI was
    rejected: macOS asks for the user's password for a binary that did not create the item, which
    an agent cannot answer.
- **Output.** Success: one JSON object on stdout, `{"tool", "text"}` (plus `"data"` once a tool
  returns structured content); the text is the tool's answer, message bodies fenced in
  `<message>…</message>` as over MCP. Errors: `{"error": "<category>", "message": "…"}` on
  stderr. Exit codes: 0 ok, 1 usage (bad command, bad argument, refused input), 2 network (app
  closed, assistant off, no answer), 3 auth (token refused), 4 other, including a refusal by the
  app (permission level, sealed chat, not signed in), whose sentence says what to do.
- **A send that may have happened is never retried.** A network failure after a write was sent
  says so ("it may have been done; check before trying again").

## 3. Commands

| Command | Tool |
|---|---|
| `postie chats list [--unread] [--kind direct\|hall]` | `list_chats` |
| `postie chats get <chat>` | `get_chat` |
| `postie chats mark-read <chat>` | `mark_chat_read` |
| `postie messages list <chat> [--limit N] [--before ID]` | `read_messages` |
| `postie messages draft <chat> --text T` | `draft_message` |
| `postie messages send <chat> --text T` | `send_message` |
| `postie messages edit <chat> <message-id> --text T` | `edit_message` |
| `postie messages retract <chat> <message-id>` | `retract_message` |
| `postie messages hide <chat> <message-id>` | `hide_message` |
| `postie messages react <chat> <message-id> --emoji E` | `react_to_message` |
| `postie contacts find <query>` | `find_contacts` |
| `postie presence set <online\|away\|dnd> [--status S]` | `set_presence` |
| `postie tools` | `tools/list`: the app's tools; also the "is it on?" check |
| `postie call <tool> [<json>\|-]` | any tool, arguments as JSON ("JSON in") |

`--text -` (and `call <tool> -`) reads stdin. `--help` (or `-h`) everywhere; `postie --help` prints
the whole tree.

**Sending.** `messages send`, `edit` and `retract` work only at the highest level, which the user
sets in Settings › Claude. Over MCP, Claude Code asks the user before each send
(`requiresUserInteraction`); a shell has no such hook, so the skill tells agents to draft by
default and to send only when the user asked, after showing the recipient and the text. Whoever
sets the highest level and lets an agent run `postie messages send` without approval accepts that.

## 4. Skill

One file, `docs/agents/postie-cli/SKILL.md`, for any agent tool that reads the `SKILL.md` format;
`.claude/skills/postie-cli` is a symbolic link to its folder, so Claude Code finds it in this
repository and the two never drift. It holds what `--help` cannot: setup, output shapes, exit
codes, the levels, untrusted message bodies, draft before send, and the tool names the app's
sentences use.

## 5. Tests

- Unit tests (`apps/cli/src/*.rs`): parsing into a tool call, help, stdin, errors; reading the
  endpoint file and the env; refusing a remote host; HTTP response parsing; mapping MCP answers
  and HTTP statuses to output and exit codes.
- A test against a fake endpoint (a loopback `TcpListener` in the test) for the whole request.
- The app side: writing and removing the file (`src-tauri/src/mcp/discovery.rs`), mode 0600.

## Points to check

- Verified on 2026-10-17: unit tests, a fake endpoint, and the release binary against the real
  `packages/mcp` handler over the core fakes. **Not yet** against a running app's Rust listener
  (another session's dev window held the single instance); the guard's rules are unit-tested.
- At the "read" level the app lets `react_to_message`, `mark_chat_read` and `set_presence`
  through (`packages/mcp/src/tools/write.ts` checks no level for them); the skill says so as it is.

- In the App Store (sandboxed) build, the app data dir sits in the app's container
  (`~/Library/Containers/com.snouzylabs.heypostie/Data/Library/Application Support/…`); the CLI
  looks there too. Whether macOS asks before another process reads a container: unknown.
- Bundling `postie` with the app (sidecar, a "Install the command line" button) is not done.
