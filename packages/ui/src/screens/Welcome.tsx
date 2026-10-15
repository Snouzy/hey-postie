import { useText } from '../core/CoreProvider';
import { Postie } from '../illustrations/Postie';
import styles from './Welcome.module.css';

interface WelcomeProps {
  onSignIn: () => void;
  onCreateAccount: () => void;
}

/** The first screen: Postie, the name, and the two doors in. */
export function Welcome({ onSignIn, onCreateAccount }: WelcomeProps) {
  const text = useText();
  return (
    <main className={styles.welcome}>
      <Postie mood="happy" label={text('postie.alt.happy')} size={200} />
      <h1 className={styles.title}>{text('welcome.title')}</h1>
      <p className={styles.tagline}>{text('welcome.tagline')}</p>
      <div className={styles.actions}>
        <button type="button" className={styles.primary} onClick={onSignIn}>
          {text('welcome.signIn')}
        </button>
        <button type="button" className={styles.secondary} onClick={onCreateAccount}>
          {text('welcome.createAccount')}
        </button>
      </div>
    </main>
  );
}
