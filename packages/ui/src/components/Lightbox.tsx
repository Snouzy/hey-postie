import { useText } from '../core/CoreProvider';
import { Button } from './Button';
import { Dialog } from './Dialog';

interface LightboxProps {
  name: string;
  /** An object URL made by the caller, who also revokes it. */
  url: string;
  onSave: () => void;
  onClose: () => void;
  /** From the archive: the letter it came with, in the conversation. */
  onShowInChat?: (() => void) | undefined;
}

/** The picture, large, in a dialog: Esc closes, "Save" hands the bytes to the host. */
export function Lightbox({ name, url, onSave, onClose, onShowInChat }: LightboxProps) {
  const text = useText();
  return (
    <Dialog title={name} onClose={onClose}>
      <img className="mx-auto my-0 block max-h-[70vh] max-w-full rounded-sm" src={url} alt={name} />
      <div className="flex justify-end gap-2">
        {onShowInChat && (
          <Button
            onClick={() => {
              onClose();
              onShowInChat();
            }}
          >
            {text('archive.showInChat')}
          </Button>
        )}
        <Button variant="primary" onClick={onSave}>
          {text('parcel.save')}
        </Button>
      </div>
    </Dialog>
  );
}
