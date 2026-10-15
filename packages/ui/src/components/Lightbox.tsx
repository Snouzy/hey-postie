import { useText } from '../core/CoreProvider';
import { Button } from './Button';
import { Dialog } from './Dialog';
import styles from './Lightbox.module.css';

interface LightboxProps {
  name: string;
  /** An object URL made by the caller, who also revokes it. */
  url: string;
  onSave: () => void;
  onClose: () => void;
}

/** The picture, large, in a dialog: Esc closes, "Save" hands the bytes to the host. */
export function Lightbox({ name, url, onSave, onClose }: LightboxProps) {
  const text = useText();
  return (
    <Dialog title={name} onClose={onClose}>
      <img className={styles.image} src={url} alt={name} />
      <div className={styles.actions}>
        <Button variant="primary" onClick={onSave}>
          {text('parcel.save')}
        </Button>
      </div>
    </Dialog>
  );
}
