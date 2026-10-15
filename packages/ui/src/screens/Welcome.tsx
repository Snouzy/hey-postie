import { useText } from '../core/CoreProvider';
import { Postie } from '../illustrations/Postie';
import styles from './Welcome.module.css';

/** The first screen: Postie, the name, and the two doors in. Behavior comes with milestone 1. */
export function Welcome() {
  const text = useText();
  return (
    <main className={styles.welcome}>
      <Postie mood="happy" label={text('postie.alt.happy')} size={200} />
      <h1 className={styles.title}>{text('welcome.title')}</h1>
      <p className={styles.tagline}>{text('welcome.tagline')}</p>
      <div className={styles.actions}>
        <button type="button" className={styles.primary}>
          {text('welcome.signIn')}
        </button>
        <button type="button" className={styles.secondary}>
          {text('welcome.createAccount')}
        </button>
      </div>
    </main>
  );
}
