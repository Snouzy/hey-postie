# Brand

_Created 2026-10-15, during the first brainstorming session._

## Intent

A strong and warm brand, in the spirit of Holy PDF: a character that makes a utility app memorable.

## Name: Hey Postie

Decision of 2026-10-15. Why:

- the same recipe as "Holy PDF": an exclamation and a simple word, understood everywhere;
- it gives the character a voice: you call him, he shows up with his satchel;
- it declines naturally per feature (encryption, files, rooms…).

Rejected or set aside: Dear Postie, Mister Postie, Little Postie, Hi Postie, OK Postie (sounds like
"OK Google"), Sealed Post and Hush Post (say "privacy" but not the character; `.com` taken).

## Character

A retro postman: cap, bike, satchel. Chosen on 2026-10-15 over a carrier pigeon (risk of confusion
with Pidgin) and a talkative animal ("Parrot" is taken by drones and Parrot OS). Moods, palette,
typography and tone of voice are still to design.

## Checks of 2026-10-15

| Item | Result |
|---|---|
| hey-postie.com, hey-postie.app | available (RDAP) |
| heypostie.com, heypostie.app, heypostie.chat | available (RDAP) |
| GitHub `hey-postie` user, `heypostie` organization | not taken |
| Product named "Postie" | only a WordPress plugin (publish posts by email); no messenger found (web search) |
| INPI, EUIPO, USPTO trademarks, classes 9 and 38 | **to check by hand** |

## Still to do

- Check trademarks, then buy the domain(s).
- Design the character's moods, the palette, the typography and the tone of voice.

## Voice

_Decided 2026-10-16, during the copy review of the two dictionaries (`packages/ui/src/i18n/`)._

- Postie speaks in the first person ("I am knocking at the door…") and addresses the reader as
  "you" / « tu ». Decided 2026-10-16 (it was « vous » for a few hours): Postie is a friend, not a
  clerk. Buttons and menu items that act for the reader speak as the reader ("Create my account",
  "My devices…", "Remember me"). Nothing else is in the first person of the reader.
- No contractions in English ("I cannot", "do not"): that is Postie's quaint register. Short
  sentences, at most ~20 words. No semicolons: start a new sentence.
- Every error says what happened, then what to do next ("Check it and try again"). No "Error:"
  prefix, no "oops", no joke, no exclamation mark. The only exclamation mark is Postie's greeting
  on the welcome screen.
- Buttons are verbs ("Send", "Delete for good"). Panels and menus are named after what they open
  ("Members", "Details", "More"). Titles are not sentences. Placeholders are examples
  (`name@server`, "Back at five").
- Sentence case everywhere. Role headings are plural ("Moderators"); affiliations are lowercase
  badges ("owner").
- French: tutoiement (« Choisis », « Réessaie », « ton adresse »), no anglicism, typographic
  apostrophe (’), « guillemets », and a non-breaking space (U+00A0) before `; : ! ?` and inside the
  guillemets. A unit test in `i18n/index.test.ts` checks the typography.

## Glossary

One word per thing, in both languages. A new text uses these words; a synonym is a bug.

| EN | FR | Meaning |
|---|---|---|
| letter | lettre | a message (feminine agreements in French: « envoyée », « lue ») |
| chat | discussion | a thread of letters with one person or one hall |
| hall | salon | a group chat (XMPP room, XEP-0045) |
| parcel | colis | a file or picture sent in a chat |
| address | adresse | a JID (`name@server`); never "JID" in the interface |
| address book | carnet d’adresses | the list of contacts (the roster) |
| contact | contact | one person in the address book |
| stranger | inconnu | someone outside the address book ("Letters from strangers", "Parcels from strangers") |
| letter box | boîte aux lettres | the account on the server (opened when created, closed when deleted) |
| server | serveur | the XMPP server |
| seal, sealed | sceller, scellé(e) | end-to-end encryption (OMEMO); the wax seal |
| stamp | tampon | a delivery status on a letter ("Delivered", "Read"); never the encryption |
| key | clé | an OMEMO device key; "fingerprint" / « empreinte » for its digest |
| device | appareil | one of the reader's or a contact's OMEMO devices |
| bell | cloche | a notification ("Ring the bell for", "no bell rings") |
| satchel | sacoche | Postie's bag, for limits and lists ("too long for my satchel") |
| nickname | pseudo | the name used inside a hall |
| bookmark | signet | a hall kept in the sidebar |
| sign in, sign out | se connecter, se déconnecter | never "log in" / « se logger » |
