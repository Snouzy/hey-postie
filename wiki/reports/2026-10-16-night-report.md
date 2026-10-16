# Visual report, night of 2026-10-16

_Screenshots of the real Tauri window (macOS, debug build of `feat/m2-hall` at `ccab9fb`),
light and dark, French and English. The PNGs are not in the repository: they live in the
session's scratchpad (listed at the end). Author of the run: the D1 lane._

## How the run was made

- The app was started in driven smoke mode (`--smoke`, `HEY_POSTIE_SMOKE_LOGIN`,
  `HEY_POSTIE_SMOKE_DRIVE=1`) by a driver script modelled on `apps/desktop/scripts/smoke-scenario.mjs`,
  against the shared Prosody of `tools/xmpp-server`. The peer ("bob") is the contract tests'
  `bobClient.ts`. The driver only runs the smoke commands (`open`, `send`, `join`, `leave`); the
  dialogs, panes and settings were reached by clicking the webview's accessibility tree through
  System Events (`click` on the element whose role and name match). Keystrokes do not reach the
  WKWebView through System Events on this machine, so nothing was typed in the composer.
- **Accounts.** `alice` is not fresh any more (halls and chats from other sessions), so the fresh
  account states were taken as `carol` (English) and `dave` (French), two accounts registered on
  the local server for this run (`prosodyctl register`, additive, the server was not restarted).
  `bob` plays the stranger: he is not in their address book.
- **Locale.** `main.tsx` picks the locale from `navigator.languages`, which WKWebView reads from
  the app's `AppleLanguages` default. Passing `-AppleLanguages "(fr)"` on the command line of the
  binary switches the whole interface to French without touching the settings; `LANG` has no
  effect and was not needed.
- **Theme.** The app follows the system by default, so each state was captured once in light,
  then the macOS appearance was switched to dark with System Events and captured again. The
  webview follows the switch live, no reload. The previous appearance (light) was restored.
- **Timeout.** Driven smoke mode exits after 180 s (`DRIVE_TIMEOUT` in `smoke.rs`); the first
  session died mid-run. The local build used for the captures raised it to one hour; that change
  is not committed.
- **Interference.** Other lanes drive the same binary name in parallel: the app received a
  `SIGTERM` twice during the French run, its window was hidden once, and a few stray clicks
  landed in the window (a reaction and a bare emoji letter in the English hall, the account
  menu open in two French strangers shots). Those artefacts are called out where they appear.

## States captured

76 PNG files, 38 states × 2 themes: 20 states in English, 18 in French. Only the create-account
screen and alice's main screen were taken in English alone; the French run has the request
screen as a state of its own.

| State | File stem | Shows |
|---|---|---|
| Welcome | `en-welcome`, `fr-welcome` | Postie `happy`, "Sign in" / "Create an account". |
| Sign in | `en-signin`, `fr-signin` | The form, "Remember me" checked, Postie `delivering`. |
| Create account, step "Where?" | `en-create-account` | Server field, directory link, Back / Continue. |
| Main, alice (not fresh) | `en-main-fresh` | The leftover halls of other sessions; "Pick a chat". |
| First launch (fresh account) | `en-first-launch`, `fr-first-launch` | Sidebar "No letter yet" + the "Welcome aboard" card. |
| Empty address book | `en-contacts-empty`, `fr-contacts-empty` | "An empty address book", "Add a contact". |
| Pick a chat | `en-main-pick`, `fr-main-pick` | After "Got it": sidebar empty state + "Pick a chat". The French one has the account menu open (stray click). |
| Strangers group, folded | `en-strangers-folded`, `fr-strangers-folded` | "Letters from strangers 1" heading, count on stamp yellow. |
| Strangers group, expanded | `en-strangers-expanded`, `fr-strangers-expanded` | The row with bob's note as preview. |
| Request screen | `en-strangers-expanded` (English, the screen opened by itself when the letter arrived), `fr-strangers-request` | Name, JID, Postie's explanation, "Their note", Accept / Ignore / Block…, "Letters held at the door". The French dark one has the account menu open (stray click). |
| Conversation after accept | `en-conversation`, `fr-conversation` | Two letters from bob; **the two letters the account sent are missing** (see issue 1). |
| Typing line | `en-typing`, `fr-typing` | "bob is typing…" / "bob écrit…" above the composer. |
| Conversation reloaded | `en-conversation-typed`, `en-details`, `fr-account-menu` | After a relaunch the sent letters are there, with the "Sent" ticks. |
| Details pane | `en-details`, `fr-details` | Address, Encryption ("No key on the other side yet."), "Remove contact". |
| Hall | `en-hall`, `fr-hall` | Sender nicks, a mention highlighted in yellow, own letter on the right. The English one carries a stray reaction and a bare-emoji letter. |
| Members pane | `en-hall-members`, `fr-hall-members` | Topic, JID, moderators / participants (bob is listed in the French one; in the English one he had left), fingerprint, trust buttons, the bell radios, "Leave the hall". |
| Leave-hall dialog | `en-leave-dialog`, `fr-leave-dialog` | "Leave the hall", the sentence with the hall's name, Cancel and the danger "Leave". |
| Account menu | `en-account-menu`, `fr-account-menu` | JID, presence radios, status field with counter, the four items. |
| Settings, General | `en-settings-general`, `fr-settings-general` | Language radios. |
| Settings, Appearance | `en-settings-appearance`, `fr-settings-appearance` | Theme radios. |
| Settings, Privacy and encryption | `en-settings-privacy`, `fr-settings-privacy` | Own devices, fingerprint, trust rules, parcels, blocked contacts. |

Not captured: the Account, Notifications and Advanced sections (not asked), the Licenses card,
the block-contact and remove-contact confirmations, the "New chat", "Add contact" and "Join a
hall" dialogs, the reconnecting banner, the create-account step "Who?" (no registration server
in the loop). Nothing was blocked by permissions: accessibility and screen recording were granted.

## Visual issues

Severity: **high** = wrong or misleading on screen, **medium** = visibly off, **low** = polish.

| # | Severity | Where | What |
|---|---|---|---|
| 1 | high | Conversation, after accepting a request | The letters sent from this account while the chat is open do not appear in the message list; the chat row's preview updates (`en-conversation`, `fr-conversation`), and they show after a relaunch (`en-conversation-typed`, `fr-account-menu`). Seen in both locales, both themes, in two separate sessions, with letters sent through `chats.send` (the smoke `send` command, the same service call as the composer). To confirm with a letter typed in the composer. |
| 2 | high | Settings window, every section | The conversation's sticky date chip ("Today" / "Aujourd'hui") bleeds through the dialog and floats at the top right of the section panel (`en-settings-*`, `fr-settings-*`, both themes). The chip's stacking context sits above the dialog's backdrop. |
| 3 | medium | Welcome, Sign in, Create account | A vertical scrollbar track runs the whole height of the window on the right (`*-welcome`, `*-signin`, `en-create-account`, both themes): the screen overflows the viewport by a few pixels, so the page scrolls although everything fits. Not present on Main. |
| 4 | medium | Sidebar, search field (French) | The placeholder "Rechercher une discussion" is clipped at the field's right edge ("Rechercher une discussi") in every French shot. English fits. The field needs an ellipsis or a shorter sentence. |
| 5 | low | Sidebar, Chats tab, with a request pending | The "No letter yet" empty state (Postie, "Start a chat") is shown under the "Letters from strangers" group (`en-strangers-*`, `fr-strangers-*`): the list is not empty from the user's point of view. |
| 6 | low | Request screen, "Letters held at the door" | The "Load older" button sits above the single held letter (`en-strangers-expanded`, `fr-strangers-request`), as in every chat; with one letter and nothing older it reads as noise. Same in the conversation of a brand-new chat (`*-conversation`). |
| 7 | low | Settings, Privacy and encryption | "Nobody is blocked." / "Personne n'est bloqué." is set in the serif display face while the rest of the section is in the sans body face (`*-settings-privacy`). |
| 8 | low | Sidebar, Address book tab | The search field keeps the "Search chats" placeholder on the Address book tab (`*-contacts-empty`). |
| 9 | low | Hall row, sidebar | A letter made of one emoji shows as a bare emoji preview with no text around it (`en-hall`, artefact of a stray click but the rendering is real). |
| 10 | note | Request screen | In the English run the request screen opened by itself when bob's first letter arrived, with no chat selected; in the French run it did not (the group stayed folded until clicked). Possibly a stray click from another lane; worth a look at `Main.select` on `chat.requested`. |

Nothing wrong was seen with colours or contrast in dark mode: the kraft banner of the request
screen, the yellow mention bubble, the stamp-yellow count, the danger buttons and the dialog
backdrop all hold. Spacing is consistent between the two locales; French copy fits everywhere
except the search placeholder (issue 4).

## Where the PNGs are

`/private/tmp/claude-501/-Users-mathiasbradiceanu-dev-perso-hey-postie/4c27e468-d85a-4508-a679-e8669ecd16f3/scratchpad/d1/`,
one file per state and theme: `<locale>-<state>-<light|dark>.png`, 2200 × 1440 (Retina, 1100 × 720
window). Thumbnails (640 px wide) in `thumbs/`. The driver (`drive.mjs`), the shell helpers
(`h.sh`) and the two Swift helpers (`windowid`, `mousemove`) are next to them.
