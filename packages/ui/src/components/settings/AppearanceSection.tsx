import { useText } from '../../core/CoreProvider';
import { useSettings } from '../../core/SettingsProvider';
import { DENSITIES, LETTERS_LAYOUTS, THEMES } from '../../core/settings';
import { sectionStyles as styles } from './sectionStyles';

/**
 * The theme, how letters are drawn (bubbles, lines, or each where it reads best) and the room
 * between them, all applied at once. No font size: the tokens have none to offer yet.
 */
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
        {THEMES.map((theme) => (
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
      <fieldset className={styles.group}>
        <legend className={styles.heading}>{text('settings.letters')}</legend>
        {LETTERS_LAYOUTS.map((layout) => (
          <label key={layout} className={styles.radio}>
            <input
              type="radio"
              name="letters-layout"
              value={layout}
              checked={settings.lettersLayout === layout}
              onChange={() => settings.setLettersLayout(layout)}
            />
            {text(`settings.letters.${layout}`)}
          </label>
        ))}
      </fieldset>
      <fieldset className={styles.group} aria-describedby="density-hint">
        <legend className={styles.heading}>{text('settings.density')}</legend>
        <p id="density-hint" className={styles.hint}>
          {text('settings.densityHint')}
        </p>
        {DENSITIES.map((density) => (
          <label key={density} className={styles.radio}>
            <input
              type="radio"
              name="density"
              value={density}
              checked={settings.density === density}
              onChange={() => settings.setDensity(density)}
            />
            {text(`settings.density.${density}`)}
          </label>
        ))}
      </fieldset>
    </div>
  );
}
