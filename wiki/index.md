# Hey Postie wiki

Entry point of the project's documentation. Read this page, then [rules.md](rules.md), before any task.
The folder opens as an Obsidian vault.

## Product

- [Brand](product/brand.md): name, character, domains, what is still to check.
- [Decisions](product/decisions.md): the choices made so far and why (stack, scope, distribution).
- [Release](product/release.md): how to cut a release, signing, the updater, the App Store path and the store listing checklist.

## Development

- [Technical guide](development/technical-guide.md): the tree, the three layers, how to run and verify, how to add a service.
- [Patterns](development/patterns.md): every pattern used in the code, explained. A pattern that is not here does not go in the code.
- [Dependencies](development/dependencies.md): every dependency, its license and why.
- [Converse](development/converse.md): how we use `@converse/headless`: settings, events, roster, chats, MAM, reactions, upload, OMEMO, registration, pitfalls.
- [Design system](development/design-system.md): tokens, fonts, Postie's moods, the components and their rules.
- [Interface](development/ui.md): screens, the state machine, how the UI subscribes to the core, how to add a screen.

## Reports

- [Visual report, night of 2026-10-16](reports/2026-10-16-night-report.md): screenshots of the real window in light and dark, French and English, and the visual issues found.

Contributing: [CONTRIBUTING.md](../CONTRIBUTING.md). Rules for agents and developers: [AGENTS.md](../AGENTS.md).

## Specs

Feature designs live in [`specs/`](specs/), one file per feature: `YYYY-MM-DD-<topic>-design.md`.

- [Version 1 design](specs/2026-10-15-hey-postie-v1-design.md): architecture, data and flows, interface and brand, tests, milestones.
