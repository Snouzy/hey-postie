import { useText } from '../../core/CoreProvider';
import { useSettings } from '../../core/SettingsProvider';
import { OwnDevices } from '../OwnDevices';
import { BlockedContacts } from './BlockedContacts';
import { sectionStyles as styles } from './sectionStyles';

/**
 * Whether others are told I read their letters (a rule of the core, see
 * `ChatsService.setSendReadMarkers`). Postie Seal: my devices (with "Remove"), and how trust works (spec 3.6). The rules live in
 * the core; the sentences here only explain them. Pictures from strangers waiting for a click is
 * a rule of the `files` service too, stated here so the user knows where the behaviour comes from.
 * Last, the blocked addresses, with "Unblock" (`BlockedContacts`).
 */
export function PrivacySection({ titleId }: { titleId: string }) {
  const text = useText();
  const settings = useSettings();

  return (
    <div className={styles.section}>
      <h3 id={titleId} className={styles.title}>
        {text('settings.section.privacy')}
      </h3>
      <section className={styles.group} aria-labelledby={`${titleId}-read`}>
        <h4 id={`${titleId}-read`} className={styles.heading}>
          {text('settings.privacy.readMarkers')}
        </h4>
        <label className={styles.radio}>
          <input
            type="checkbox"
            checked={settings.sendReadMarkers}
            aria-describedby={`${titleId}-read-hint`}
            onChange={(event) => settings.setSendReadMarkers(event.target.checked)}
          />
          {text('settings.privacy.sendReadMarkers')}
        </label>
        <p id={`${titleId}-read-hint`} className={styles.hint}>
          {text('settings.privacy.sendReadMarkersHint')}
        </p>
      </section>
      <section className={styles.group} aria-labelledby={`${titleId}-devices`}>
        <h4 id={`${titleId}-devices`} className={styles.heading}>
          {text('crypto.myDevices')}
        </h4>
        <OwnDevices withFingerprint />
      </section>
      <section className={styles.group} aria-labelledby={`${titleId}-trust`}>
        <h4 id={`${titleId}-trust`} className={styles.heading}>
          {text('settings.privacy.trust')}
        </h4>
        <p className={styles.hint}>{text('settings.privacy.trustExplain')}</p>
        <p className={styles.hint}>{text('settings.privacy.ownDevicesExplain')}</p>
      </section>
      <section className={styles.group} aria-labelledby={`${titleId}-parcels`}>
        <h4 id={`${titleId}-parcels`} className={styles.heading}>
          {text('settings.privacy.parcels')}
        </h4>
        <p className={styles.hint}>{text('settings.privacy.parcelsExplain')}</p>
      </section>
      <section className={styles.group} aria-labelledby={`${titleId}-blocked`}>
        <h4 id={`${titleId}-blocked`} className={styles.heading}>
          {text('settings.privacy.blocked')}
        </h4>
        <BlockedContacts />
      </section>
    </div>
  );
}
