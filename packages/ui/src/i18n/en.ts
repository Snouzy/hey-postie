export const en = {
  'app.name': 'Hey Postie',
  'welcome.title': 'Hey Postie',
  'welcome.tagline': 'Your letters, sealed and delivered.',
  'welcome.signIn': 'Sign in',
  'welcome.createAccount': 'Create an account',
  'postie.hello': 'Hello! I carry your messages, sealed, from door to door.',
  'postie.alt.happy': 'Postie, smiling, satchel on his shoulder',
  'postie.alt.delivering': 'Postie on his bike, a letter in hand',
  'postie.alt.sealed': 'Postie holding a letter with a red wax seal',
  'postie.alt.oops': 'Postie, surprised, a letter fallen at his feet',
  'postie.alt.asleep': 'Postie asleep on his satchel',
} as const;

export type MessageKey = keyof typeof en;
