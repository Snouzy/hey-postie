import { useText } from '../../core/CoreProvider';
import { useSettings } from '../../core/SettingsProvider';
import { sectionStyles as styles } from './sectionStyles';

/**
 * Whether a notification may carry the letter's text (a rule of the core, see
 * `NotificationsService.setShowPreview`). The bell of each hall is set in the hall's own pane.
 */
export function NotificationsSection({ titleId }: { titleId: string }) {
  const text = useText();
  const settings = useSettings();

  return (
    <div className={styles.section}>
      <h3 id={titleId} className={styles.title}>
        {text('settings.section.notifications')}
      </h3>
      <section className={styles.group} aria-labelledby={`${titleId}-preview`}>
        <h4 id={`${titleId}-preview`} className={styles.heading}>
          {text('settings.preview')}
        </h4>
        <label className={styles.radio}>
          <input
            type="checkbox"
            checked={settings.showPreview}
            onChange={(event) => settings.setShowPreview(event.target.checked)}
          />
          {text('settings.showPreview')}
        </label>
        <p className={styles.hint}>{text('settings.showPreviewHint')}</p>
      </section>
      <p className={styles.hint}>{text('settings.notificationsRooms')}</p>
    </div>
  );
}
