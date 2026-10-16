import type { MouseEvent } from 'react';
import { useText } from '../../core/CoreProvider';
import { useSettings } from '../../core/SettingsProvider';
import { Button } from '../Button';
import styles from './section.module.css';

export const REPOSITORY_URL = 'https://github.com/Snouzy/hey-postie';
export const WEBSITE_URL = 'https://hey-postie.com';

interface AdvancedSectionProps {
  titleId: string;
  /** Opens the Licenses dialog in place of the window (no nested dialogs). */
  onLicenses: () => void;
  onOpenLink: (url: string) => void;
  /** True when the window comes back from Licenses: the focus returns to that button. */
  focusLicenses: boolean;
}

/** About: the version, the license, the links. No logs or diagnostics exist to show yet. */
export function AdvancedSection({
  titleId,
  onLicenses,
  onOpenLink,
  focusLicenses,
}: AdvancedSectionProps) {
  const text = useText();
  const settings = useSettings();

  function open(event: MouseEvent<HTMLAnchorElement>, url: string) {
    event.preventDefault();
    onOpenLink(url);
  }

  return (
    <div className={styles.section}>
      <h3 id={titleId} className={styles.title}>
        {text('settings.section.advanced')}
      </h3>
      <section className={styles.group} aria-labelledby={`${titleId}-about`}>
        <h4 id={`${titleId}-about`} className={styles.heading}>
          {text('settings.about')}
        </h4>
        <p className={styles.text}>
          {text('app.name')}{' '}
          <span className={`${styles.mono} ${styles.muted}`}>{settings.version}</span>
        </p>
        <p className={styles.hint}>{text('settings.about.license')}</p>
        <div className={styles.row}>
          <a
            className={styles.link}
            href={WEBSITE_URL}
            rel="noreferrer"
            onClick={(event) => open(event, WEBSITE_URL)}
          >
            {text('settings.website')}
          </a>
          <a
            className={styles.link}
            href={REPOSITORY_URL}
            rel="noreferrer"
            onClick={(event) => open(event, REPOSITORY_URL)}
          >
            {text('settings.repository')}
          </a>
          <Button onClick={onLicenses} data-autofocus={focusLicenses ? '' : undefined}>
            {text('settings.licenses')}
          </Button>
        </div>
      </section>
    </div>
  );
}
