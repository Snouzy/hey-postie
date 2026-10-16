import { useText } from '../core/CoreProvider';
import { Dialog } from './Dialog';
import { OwnDevices } from './OwnDevices';

interface MyDevicesProps {
  onClose: () => void;
}

/** The "My devices…" dialog of the account menu: `OwnDevices` in a card of its own. */
export function MyDevices({ onClose }: MyDevicesProps) {
  const text = useText();
  return (
    <Dialog title={text('crypto.myDevices')} onClose={onClose}>
      <OwnDevices />
    </Dialog>
  );
}
