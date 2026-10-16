import { KeyRound, UserPlus, Users } from 'lucide-react';
import { useText } from '../core/CoreProvider';
import { Postie } from '../illustrations/Postie';
import { Button } from './Button';
import styles from './WelcomeCard.module.css';

interface WelcomeCardProps {
  onDismiss: () => void;
}

/** The first-launch card: Postie, three things to know, "Got it". Shown once per account. */
export function WelcomeCard({ onDismiss }: WelcomeCardProps) {
  const text = useText();
  const lines = [
    { icon: UserPlus, key: 'welcomeCard.contact' },
    { icon: Users, key: 'welcomeCard.room' },
    { icon: KeyRound, key: 'welcomeCard.sealed' },
  ] as const;
  return (
    <section className={styles.card} aria-labelledby="welcome-card-title">
      <Postie mood="waving" label={text('postie.alt.waving')} size={120} />
      <h2 id="welcome-card-title" className={styles.title}>
        {text('welcomeCard.title')}
      </h2>
      <ul className={styles.lines}>
        {lines.map(({ icon: Icon, key }) => (
          <li key={key} className={styles.line}>
            <Icon size={18} aria-hidden className={styles.icon} />
            <span>{text(key)}</span>
          </li>
        ))}
      </ul>
      <Button variant="primary" onClick={onDismiss}>
        {text('welcomeCard.dismiss')}
      </Button>
    </section>
  );
}
