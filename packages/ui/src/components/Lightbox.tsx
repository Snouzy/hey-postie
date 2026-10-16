import { useText } from '../core/CoreProvider';
import { Button } from './Button';
import { Dialog } from './Dialog';

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
      <img className="mx-auto my-0 block max-h-[70vh] max-w-full rounded-sm" src={url} alt={name} />
      <div className="flex justify-end">
        <Button variant="primary" onClick={onSave}>
          {text('parcel.save')}
        </Button>
      </div>
    </Dialog>
  );
}
