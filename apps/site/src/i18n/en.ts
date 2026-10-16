/** English texts of the site. Postie's voice: first person, short sentences, no contraction, no "!". */
export const en = {
  'meta.title': 'Hey Postie',
  'meta.description':
    'A friendly XMPP client, end-to-end encrypted, for Mac, Windows and Linux. Free software.',
  'meta.privacyTitle': 'Privacy',
  skip: 'Skip to content',
  'nav.home': 'Hey Postie, home',
  'nav.label': 'Site navigation',
  'nav.privacy': 'Privacy',
  'nav.download': 'Download',
  'nav.switch': 'Français',

  'hero.title': 'Hey Postie',
  'hero.tagline': 'Your letters, sealed and delivered.',
  'hero.promise': 'I am a friendly XMPP client, sealed end to end, made to take over from Pidgin.',
  'hero.cta': 'Download',
  'hero.postie': 'Postie waving hello, satchel on his shoulder',

  'features.title': 'What I carry',
  'features.letters.title': 'Letters and halls',
  'features.letters.body':
    'Write to one person, or to a whole hall. Your address book and your history stay on your server.',
  'features.sealed.title': 'Sealed with OMEMO',
  'features.sealed.body':
    'Whenever the other side has a key, I seal the letter. Nobody between us can read it, not even your server.',
  'features.parcels.title': 'Parcels',
  'features.parcels.body':
    'Pictures and files travel in my satchel, sealed like the rest, and land straight in the chat.',
  'features.servers':
    'XMPP only. I work with any XMPP server and alongside Conversations, Gajim, Monal and Dino.',

  'download.title': 'Download',
  'download.notice':
    'The first stamp is being printed. These buttons will work once version 0.1.0 is out.',
  'download.macos': 'macOS',
  'download.macosFile': '.dmg, Apple silicon',
  'download.windows': 'Windows',
  'download.windowsFile': '.exe installer',
  'download.linuxAppImage': 'Linux',
  'download.linuxAppImageFile': '.AppImage',
  'download.linuxDeb': 'Debian, Ubuntu',
  'download.linuxDebFile': '.deb',

  'footer.license': 'Free software, AGPL-3.0-or-later.',
  'footer.source': 'Source code',
  'footer.privacy':
    'No analytics, no tracking, no cookie. This site loads nothing from a third party.',
  'footer.publisher': 'Published by Snouzylabs S.R.L.',

  'privacy.title': 'Privacy',
  'privacy.intro': 'What the app and this site collect. The short answer is nothing.',
  'privacy.app.title': 'The app',
  'privacy.app.network.title': 'Network',
  'privacy.app.network.body':
    'I talk to the XMPP server you chose, and to its upload service for parcels. Once an hour at most, I ask hey-postie.com whether a newer version exists: version numbers only, no identifier.',
  'privacy.app.device.title': 'On your device',
  'privacy.app.device.body':
    'Your password sleeps in the keychain of your system. Your letters, your address book and your keys stay in a local database. Your preferences stay in local files. Nothing leaves your device except towards your own server.',
  'privacy.app.nothing.title': 'Nothing else',
  'privacy.app.nothing.body':
    'No analytics, no crash report, no advertising identifier, no third-party kit that collects data.',
  'privacy.app.files.title': 'Files',
  'privacy.app.files.body': 'I open only the files you pick, and I save only where you tell me.',
  'privacy.app.bells.title': 'Bells',
  'privacy.app.bells.body':
    'A system notification rings for a new letter. A setting hides its preview.',
  'privacy.site.title': 'This site',
  'privacy.site.body':
    'These pages are static files. No analytics, no cookie, no font or script from a third party. The server that hosts them answers your requests and that is all it does.',
  'privacy.source': 'The code is public. Anyone can check these sentences against it.',
} as const;

export type MessageKey = keyof typeof en;
