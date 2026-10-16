# Desktop XMPP clients compared, 2026-10-17

The sources behind the README's "How it compares" table. Checked by reading each client's DOAP
file (its own XEP declaration), grepping its source at HEAD, and its latest release. A DOAP
`since` later than the latest release counts as **not released** (Monal reactions "since 7.0",
Dino XEP-0490 "since 0.6"). Re-check before quoting: these clients move.

## Matrix

| Feature | Gajim | Dino | Pidgin 2 (+lurch) | Fluux Messenger | Converse.js | Monal |
|---|---|---|---|---|---|---|
| Mac / Win / Linux | how-to on the wiki / Y / Y | Linux only (README) | N / Y / Y | Y / Y / Y (+ web) | browser | Mac (+ iOS) |
| OMEMO readable by Conversations | Y, 0.3 | Y, 0.3 (since 0.1) | lurch plugin, 0.3 | N: OpenPGP OX only, 0384 "planned" | Y, 0.3 since 4.0.0; OMEMO 2 since 14.0.0 | Y, 0.3 since 4.8 |
| Correction XEP-0308 | Y | Y since 0.2 | N | Y | Y since 4.0.0 | Y since 4.8 |
| Retraction XEP-0424 | Y since 2.2.0 | N in a release (master only, after v0.5.1) | N | Y | Y since 6.0.0 | Y since 6.3 |
| Reactions XEP-0444 | partial since 1.9.0 | Y since 0.4 | N | Y | Y since 13.0.0 | N in a release (DOAP "since 7.0", latest 6.4.23) |
| Replies XEP-0461 | Y since 1.9.0 | Y since 0.4 | N | Y | Y | N |
| Read markers XEP-0333 | partial since 1.3.0 (displayed only) | Y since 0.1 | N | N ("planned") | partial since 4.1.1 | Y since 4.8 |
| Read sync XEP-0490 | Y since 2.1.0 | N in a release | N | Y | N | Y since 6.3 |
| Moderation XEP-0425 | Y since 1.4.0 | N in a release | N | Y (bulk too) | Y since 6.0.0 | Y since 6.3 |
| In-band registration XEP-0077 | Y | Y since 0.1 | Y | N (password change only) | Y since 0.8.5 | partial since 4.7 |
| Account deletion on the server | Y | N | Y | N | N | Y |
| HTTP upload XEP-0363 | Y | Y since 0.1 | N in core | Y | Y since 4.0.0 | Y since 4.9 |
| Link previews | Y since 2.4.2 (Open Graph) | N | N | Y (Open Graph) | rooms (server unfurls) | Y |
| Search in history | Y | Y (global) | log viewer (not checked) | Y (local index + archive) | N | Y |
| AI / MCP | N | N | N | Y: 3 tools (list, history, send at 10/min), since 0.17.4 | N | N |
| Latest release | 2.6.0, 2026-08-26 | 0.5.1, 2025-11-15 | 2.14.14, 2025-01-23; lurch 0.7.0, 2021-02-11 | 0.17.4, 2026-09-16 | 14.0.0, 2026-06-26 | 6.4.23, 2026-10-07 |
| License | GPL-3.0 | GPL-3.0 | GPL-2.0 | AGPL-3.0 | MPL-2.0 | BSD-2-Clause |

## Sources

- Gajim: https://xmpp.org/doap/gajim.doap; gitlab.com/gajim/gajim (`gtk/remove_account.py`,
  `gtk/search_view.py`, `common/open_graph_parser.py`, ChangeLog 2.4.2, README on macOS).
- Dino: https://raw.githubusercontent.com/dino/dino/master/dino.doap; the 0424, 0425 and 0490
  modules are absent at tag v0.5.1; `main/src/ui/global_search.vala`,
  `libdino/src/service/registration.vala`.
- Monal: https://raw.githubusercontent.com/monal-im/Monal/develop/monal.doap; `XMPPEdit.m`
  (account removal), `MLSearchViewController`.
- Converse.js: https://raw.githubusercontent.com/conversejs/converse.js/master/conversejs.doap;
  CHANGES.md (OMEMO 2 in 14.0.0); `src/plugins/register`, `muc-views/search.js` (a room directory
  search, not history).
- Fluux: `fluux-messenger.doap` at 52d5dd8 (2026-10-16), README, `docs/MCP.md`,
  `docs/STRATEGIC_REVIEW.md` ("There is no registration"). Study:
  [2026-10-17-fluux-study.md](2026-10-17-fluux-study.md).
- Pidgin: the 2.14.14 tarball; `libpurple/protocols/jabber` has none of the modern namespaces;
  `jabber.c` holds account removal. lurch: github.com/gkdr/lurch releases.

## Not verified

Pidgin's log search and upload plugins; whether Monal's search covers one chat or all; whether
Converse fetches previews itself; unofficial Mac/Windows builds of Gajim and Dino.
