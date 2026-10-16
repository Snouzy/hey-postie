import { useEffect, useState } from 'react';
import { useCore } from '../core/CoreProvider';
import { readWelcomed, writeWelcomed } from '../core/settings';

/** The first-launch card: once per account, and only for an empty address book. */
export function useWelcome(jid: string): { welcoming: boolean; dismissWelcome: () => void } {
  const core = useCore();
  const [welcoming, setWelcoming] = useState(false);

  useEffect(() => {
    if (readWelcomed(jid)) return;
    let cancelled = false;
    core.contacts
      .list()
      .then((list) => !cancelled && list.length === 0 && setWelcoming(true))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [core, jid]);

  function dismissWelcome() {
    writeWelcomed(jid);
    setWelcoming(false);
  }

  return { welcoming, dismissWelcome };
}
