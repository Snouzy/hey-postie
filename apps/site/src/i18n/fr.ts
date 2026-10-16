import type { MessageKey } from './en';

/** Textes français du site. Vouvoiement, apostrophe typographique, espace insécable avant « : » et « ? ». */
export const fr: Record<MessageKey, string> = {
  'meta.title': 'Hey Postie',
  'meta.description':
    'Un client XMPP chaleureux, chiffré de bout en bout, pour Mac, Windows et Linux. Logiciel libre.',
  'meta.privacyTitle': 'Confidentialité',
  skip: 'Aller au contenu',
  'nav.home': 'Hey Postie, accueil',
  'nav.label': 'Navigation du site',
  'nav.privacy': 'Confidentialité',
  'nav.download': 'Télécharger',
  'nav.switch': 'English',

  'hero.title': 'Hey Postie',
  'hero.tagline': 'Vos lettres, scellées et livrées.',
  'hero.promise':
    'Je suis un client XMPP chaleureux, scellé de bout en bout, fait pour prendre la relève de Pidgin.',
  'hero.cta': 'Télécharger',
  'hero.postie': 'Postie qui fait coucou, sa sacoche à l’épaule',

  'features.title': 'Ce que je porte',
  'features.letters.title': 'Lettres et salons',
  'features.letters.body':
    'Écrivez à une personne, ou à tout un salon. Votre carnet d’adresses et votre historique restent sur votre serveur.',
  'features.sealed.title': 'Scellé avec OMEMO',
  'features.sealed.body':
    'Dès que l’autre côté a une clé, je scelle la lettre. Personne entre nous ne peut la lire, pas même votre serveur.',
  'features.parcels.title': 'Colis',
  'features.parcels.body':
    'Images et fichiers voyagent dans ma sacoche, scellés comme le reste, et arrivent droit dans la discussion.',
  'features.servers':
    'XMPP seulement. Je fonctionne avec n’importe quel serveur XMPP et aux côtés de Conversations, Gajim, Monal et Dino.',

  'download.title': 'Télécharger',
  'download.notice':
    'Le premier tampon est à l’impression. Ces boutons fonctionneront dès la sortie de la version 0.1.0.',
  'download.macos': 'macOS',
  'download.macosFile': '.dmg, Apple silicon',
  'download.windows': 'Windows',
  'download.windowsFile': 'installateur .exe',
  'download.linuxAppImage': 'Linux',
  'download.linuxAppImageFile': '.AppImage',
  'download.linuxDeb': 'Debian, Ubuntu',
  'download.linuxDebFile': '.deb',

  'footer.license': 'Logiciel libre, AGPL-3.0-or-later.',
  'footer.source': 'Code source',
  'footer.privacy':
    'Ni statistiques, ni pistage, ni cookie. Ce site ne charge rien depuis un tiers.',
  'footer.publisher': 'Publié par Snouzylabs S.R.L.',

  'privacy.title': 'Confidentialité',
  'privacy.intro': 'Ce que l’application et ce site collectent. La réponse courte : rien.',
  'privacy.app.title': 'L’application',
  'privacy.app.network.title': 'Réseau',
  'privacy.app.network.body':
    'Je parle au serveur XMPP que vous avez choisi, et à son service d’envoi pour les colis. Au plus une fois par heure, je demande à hey-postie.com si une version plus récente existe : des numéros de version seulement, aucun identifiant.',
  'privacy.app.device.title': 'Sur votre appareil',
  'privacy.app.device.body':
    'Votre mot de passe dort dans le trousseau de votre système. Vos lettres, votre carnet d’adresses et vos clés restent dans une base locale. Vos préférences restent dans des fichiers locaux. Rien ne quitte votre appareil, sauf vers votre propre serveur.',
  'privacy.app.nothing.title': 'Rien d’autre',
  'privacy.app.nothing.body':
    'Ni statistiques, ni rapport de plantage, ni identifiant publicitaire, ni kit tiers qui collecte des données.',
  'privacy.app.files.title': 'Fichiers',
  'privacy.app.files.body':
    'Je n’ouvre que les fichiers que vous choisissez, et je n’enregistre que là où vous me le dites.',
  'privacy.app.bells.title': 'Cloches',
  'privacy.app.bells.body':
    'Une notification système sonne pour une nouvelle lettre. Un réglage masque son aperçu.',
  'privacy.site.title': 'Ce site',
  'privacy.site.body':
    'Ces pages sont des fichiers statiques. Ni statistiques, ni cookie, ni police ou script venus d’un tiers. Le serveur qui les héberge répond à vos requêtes, et c’est tout ce qu’il fait.',
  'privacy.source': 'Le code est public. Chacun peut vérifier ces phrases en le lisant.',
};
