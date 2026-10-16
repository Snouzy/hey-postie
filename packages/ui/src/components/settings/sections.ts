import type { MessageKey } from '../../i18n';

/** The sections of the settings window, in the order of the navigation. */
export type SettingsSection =
  | 'general'
  | 'account'
  | 'appearance'
  | 'notifications'
  | 'privacy'
  | 'advanced';

export const SETTINGS_SECTIONS: readonly SettingsSection[] = [
  'general',
  'account',
  'appearance',
  'notifications',
  'privacy',
  'advanced',
];

export function sectionTitleKey(section: SettingsSection): MessageKey {
  return `settings.section.${section}`;
}
