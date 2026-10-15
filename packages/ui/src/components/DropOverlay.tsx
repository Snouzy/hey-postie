import { useText } from '../core/CoreProvider';
import { Postie } from '../illustrations/Postie';
import styles from './DropOverlay.module.css';

/** Shown over the conversation while files are dragged across it. */
export function DropOverlay() {
  const text = useText();
  return (
    <div className={styles.overlay} role="status">
      <Postie mood="delivering" label={text('postie.alt.delivering')} size={120} />
      <p className={styles.sentence}>{text('parcel.drop')}</p>
    </div>
  );
}
