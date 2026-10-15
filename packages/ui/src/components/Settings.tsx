import type { MouseEvent } from 'react';
import { useText } from '../core/CoreProvider';
import { useSettings } from '../core/SettingsProvider';
import { LOCALE_CHOICES, type LocaleChoice, THEMES, type Theme } from '../core/settings';
import { Button } from './Button';
import { Dialog } from './Dialog';
import styles from './Settings.module.css';

interface SettingsProps {
  onClose: () => void;
  /** Opens the Licenses dialog; this one closes (no nested dialogs: Esc has one card to close). */
  onLicenses: () => void;
  onOpenLink: (url: string) => void;
}

export const REPOSITORY_URL = 'https://github.com/snouzylabs/hey-postie';

/** Each language is named in itself, so a reader lost in the wrong one still finds their own. */
const LANGUAGE_NAMES: Record<Exclude<LocaleChoice, 'system'>, string> = {
  en: 'English',
  fr: 'Français',
};

/**
 * The per-viewer choices: theme, notification preview, language, and the About corner. Every
 * change applies at once; there is no "Save". The values live in `SettingsProvider` (see `App`).
 */
export function Settings({ onClose, onLicenses, onOpenLink }: SettingsProps) {
  const text = useText();
  const settings = useSettings();

  function openRepository(event: MouseEvent<HTMLAnchorElement>) {
    event.preventDefault();
    onOpenLink(REPOSITORY_URL);
  }

  return (
    <Dialog title={text('settings.title')} onClose={onClose}>
      <div className={styles.sections}>
        <fieldset className={styles.section}>
          <legend className={styles.heading}>{text('settings.appearance')}</legend>
          {THEMES.map((theme: Theme) => (
            <label key={theme} className={styles.radio}>
              <input
                type="radio"
                name="theme"
                value={theme}
                checked={settings.theme === theme}
                onChange={() => settings.setTheme(theme)}
              />
              {text(`settings.theme.${theme}`)}
            </label>
          ))}
        </fieldset>

        <section className={styles.section} aria-labelledby="settings-notifications">
          <h3 id="settings-notifications" className={styles.heading}>
            {text('settings.notifications')}
          </h3>
          <label className={styles.radio}>
            <input
              type="checkbox"
              role="switch"
              checked={settings.showPreview}
              aria-checked={settings.showPreview}
              onChange={(event) => settings.setShowPreview(event.target.checked)}
            />
            {text('settings.showPreview')}
          </label>
          <p className={styles.hint}>{text('settings.showPreviewHint')}</p>
        </section>

        <fieldset className={styles.section}>
          <legend className={styles.heading}>{text('settings.language')}</legend>
          {LOCALE_CHOICES.map((choice) => (
            <label key={choice} className={styles.radio}>
              <input
                type="radio"
                name="language"
                value={choice}
                checked={settings.locale === choice}
                onChange={() => settings.setLocale(choice)}
              />
              {choice === 'system' ? text('settings.language.system') : LANGUAGE_NAMES[choice]}
            </label>
          ))}
        </fieldset>

        <section className={styles.section} aria-labelledby="settings-about">
          <h3 id="settings-about" className={styles.heading}>
            {text('settings.about')}
          </h3>
          <p className={styles.about}>
            {text('app.name')} <span className={styles.version}>{settings.version}</span>
          </p>
          <div className={styles.aboutActions}>
            <a href={REPOSITORY_URL} rel="noreferrer" onClick={openRepository}>
              {text('settings.repository')}
            </a>
            <Button onClick={onLicenses}>{text('settings.licenses')}</Button>
          </div>
        </section>
      </div>
    </Dialog>
  );
}
