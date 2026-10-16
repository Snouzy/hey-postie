import { useText } from '../../core/CoreProvider';
import { useSettings } from '../../core/SettingsProvider';
import { LOCALE_CHOICES, type LocaleChoice } from '../../core/settings';
import { sectionStyles as styles } from './sectionStyles';

/** Each language is named in itself, so a reader lost in the wrong one still finds their own. */
const LANGUAGE_NAMES: Record<Exclude<LocaleChoice, 'system'>, string> = {
  en: 'English',
  fr: 'Français',
};

/** The language. Launch behaviour has nothing behind it yet, so it is not here. */
export function GeneralSection({ titleId }: { titleId: string }) {
  const text = useText();
  const settings = useSettings();

  return (
    <div className={styles.section}>
      <h3 id={titleId} className={styles.title}>
        {text('settings.section.general')}
      </h3>
      <fieldset className={styles.group}>
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
    </div>
  );
}
