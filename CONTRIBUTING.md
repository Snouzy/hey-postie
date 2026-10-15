# Contributing

Thanks for helping. Hey Postie is built by humans and AI agents together; the same rules apply to both.

## Before you start

1. Read [AGENTS.md](AGENTS.md): the three layers, KISS, SOLID, and how parallel work stays compatible.
2. Read [wiki/index.md](wiki/index.md), then the [technical guide](wiki/development/technical-guide.md).
3. A feature starts from a spec in `wiki/specs/`. Open an issue or a draft spec before a large change.

## Set up

```sh
pnpm install
pnpm desktop:dev
```

Needs Node 24+, pnpm 12, Rust stable. Linux: `libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev patchelf libdbus-1-dev`.

## Make a change

- One branch per task. Never commit on `main`.
- Keep pull requests small and rebased on `main`.
- A code change updates its wiki page in the same commit.
- Every service has unit tests against fake repositories (`packages/core/src/fakes/`).
- Run `pnpm verify` before opening a pull request. There is no CI yet: the local run is the gate.
- Code, comments, commits and pull requests are in English. User-facing texts go in
  `packages/ui/src/i18n/` (French and English).

## Privacy

Never commit secrets, real JIDs, real message contents, or logs with any of those. Never log
message bodies, passwords, keys or fingerprints.

## Sign your commits

Contributions are under AGPL-3.0-or-later with the additional terms in
[LICENSE-EXCEPTION.md](LICENSE-EXCEPTION.md). Certify the
[Developer Certificate of Origin](https://developercertificate.org/) with `git commit -s`.
