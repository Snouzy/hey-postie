import type { Contact } from '@hey-postie/core';
import { useCallback, useEffect, useState } from 'react';
import { useCore } from './CoreProvider';
import { useCoreEvent } from './useCoreEvent';

/** The address book, re-read from the service on every `contact.updated`. */
export function useContacts(): Contact[] {
  const core = useCore();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const refresh = useCallback(async () => setContacts(await core.contacts.list()), [core]);
  useEffect(() => void refresh(), [refresh]);
  useCoreEvent('contact.updated', () => void refresh());
  return contacts;
}
