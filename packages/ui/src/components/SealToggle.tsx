import { Lock, LockOpen } from 'lucide-react';
import { useText } from '../core/CoreProvider';
import { Button } from './Button';
import styles from './SealToggle.module.css';

interface SealToggleProps {
  encrypted: boolean;
  /** The service has not answered yet: the lock waits, and takes no second click. */
  pending: boolean;
  onToggle: () => void;
}

/** The lock in a conversation's header: pressed when the letters of this chat are sealed. */
export function SealToggle({ encrypted, pending, onToggle }: SealToggleProps) {
  const text = useText();
  return (
    <Button
      variant="ghost"
      className={encrypted ? styles.sealed : undefined}
      onClick={onToggle}
      disabled={pending}
      aria-busy={pending}
      aria-pressed={encrypted}
      aria-label={text('crypto.seal')}
      title={text('crypto.seal')}
    >
      {encrypted ? <Lock size={18} aria-hidden /> : <LockOpen size={18} aria-hidden />}
    </Button>
  );
}
