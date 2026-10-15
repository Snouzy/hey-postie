# Wiki rules

The wiki is maintained by AI agents and humans together, and reviewed by humans. It explains the
code and the decisions; the code stays the source of truth for behavior.

## Proof

- Every technical claim names at least one source file (`packages/core/src/services/...`) or an
  external source (link and date consulted).
- Separate what is **verified**, what is **assumed**, and what is **unknown**. Say which is which.
- When two sources disagree, do not pick one silently: write it in a `Points to check` section.
- An agent's answer is not a source. It can become a working note, never a proof.
- Date the checks that depend on the current code or on the outside world ("checked on 2026-10-15").

## Keeping it in sync

- A code change updates its wiki page **in the same commit** (see [AGENTS.md](../AGENTS.md)).
- A new, renamed or obsolete page updates [index.md](index.md) in the same commit.
- Git history and pull requests are the change log: no separate journal.

## Style

- English, simple Markdown, descriptive headings, relative links between pages.
- Small pages, one topic each, rather than one big document.
- Decisions carry their date and their reason: "Decision of 2026-10-15: X, because Y."

## Privacy

- The repository is public: everything in the wiki is readable by anyone.
- Never copy secrets, tokens, passwords, personal data, real message contents or real JIDs.

## Health check

From time to time, look for pages not linked from the index, broken links, claims without a source,
contradictions, and pages to re-check after a change in the code.
