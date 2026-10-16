import { useText } from '../../core/CoreProvider';
import { useSettings } from '../../core/SettingsProvider';
import { THEMES, type Theme } from '../../core/settings';
import { sectionStyles as styles } from './sectionStyles';

/** The theme, applied at once (`useTheme`). No font size: the tokens have none to offer yet. */
export function AppearanceSection({ titleId }: { titleId: string }) {
  const text = useText();
  const settings = useSettings();

  return (
    <div className={styles.section}>
      <h3 id={titleId} className={styles.title}>
        {text('settings.section.appearance')}
      </h3>
      <fieldset className={styles.group}>
        <legend className={styles.heading}>{text('settings.theme')}</legend>
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
    </div>
  );
}
