import type { Device } from '@hey-postie/core';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { MessageKey } from '../i18n';
import { errorKey } from '../i18n/errors';
import { useCore } from './CoreProvider';
import { useCoreEvent } from './useCoreEvent';

export interface MemberDevicesState {
  /** One entry per address asked, once all have answered; empty while loading. */
  byJid: Map<string, Device[]>;
  loaded: boolean;
  error: MessageKey | null;
  reload: () => void;
}

/**
 * The devices of several addresses at once (a hall's members), so the pane can tell "nobody has
 * a key" from "still reading". A `devices.changed` for one of them replaces that entry.
 */
export function useMemberDevices(jids: string[]): MemberDevicesState {
  const core = useCore();
  const [byJid, setByJid] = useState<Map<string, Device[]>>(new Map());
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<MessageKey | null>(null);
  const requests = useRef(0);
  // The list is rebuilt by the caller on every render; its content is what matters.
  const key = jids.join('\n');

  const reload = useCallback(() => {
    requests.current += 1;
    const mine = requests.current;
    const wanted = key ? key.split('\n') : [];
    setError(null);
    setLoaded(false);
    Promise.all(wanted.map(async (jid) => [jid, await core.crypto.devices(jid)] as const))
      .then((entries) => {
        if (mine !== requests.current) return;
        setByJid(new Map(entries));
        setLoaded(true);
      })
      .catch((caught: unknown) => mine === requests.current && setError(errorKey(caught)));
  }, [core, key]);

  useEffect(() => reload(), [reload]);

  useCoreEvent('devices.changed', (payload) => {
    if (!key.split('\n').includes(payload.jid)) return;
    setByJid((current) => new Map(current).set(payload.jid, payload.devices));
  });

  return { byJid, loaded, error, reload };
}
