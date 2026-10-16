import type { Chat, ContactRequest } from '@hey-postie/core';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useCore } from './CoreProvider';
import { useCoreEvent } from './useCoreEvent';

/** One row of the "Letters from strangers" group: a pending request, a stranger's chat, or both. */
export interface RequestRow {
  jid: string;
  name: string;
  /** The sentence attached to the subscription request, already sanitized by the service. */
  message?: string;
  /** True when a subscription request is pending (ignoring then declines it). */
  requested: boolean;
  /** The stranger's chat, when they wrote before asking. */
  chat?: Chat;
  /** When it last moved: their last letter, or the moment the request was seen. */
  at: Date;
}

/**
 * The service settles it with `Chat.isRequest`: they wrote and this account never did. A chat
 * the user opened with someone outside the address book, or answered, is an ordinary chat.
 */
export function isRequest(chat: Chat): boolean {
  return chat.isRequest === true;
}

/**
 * The message requests (decision of 2026-10-16): `contacts.requests()`, re-read on every
 * `contact.requested` and `contact.updated` (accepting removes one), merged with the strangers'
 * chats. Ignored and blocked JIDs are hidden for the session (`hide`); a new request or a new
 * letter from them brings the row back.
 */
export function useRequests(chats: Chat[]): {
  rows: RequestRow[];
  refresh: () => Promise<void>;
  hide: (jid: string) => void;
} {
  const core = useCore();
  const [requests, setRequests] = useState<ContactRequest[]>([]);
  const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set());
  const seenAt = useRef(new Map<string, Date>());
  const requestsCounter = useRef(0);

  const refresh = useCallback(async () => {
    requestsCounter.current += 1;
    const mine = requestsCounter.current;
    const list = await core.contacts.requests();
    const now = new Date();
    for (const request of list) {
      if (!seenAt.current.has(request.jid)) seenAt.current.set(request.jid, now);
    }
    if (mine === requestsCounter.current) setRequests(list);
  }, [core]);

  useEffect(() => {
    refresh().catch(() => setRequests([]));
  }, [refresh]);

  const show = (jid: string) =>
    setHidden((current) => {
      if (!current.has(jid)) return current;
      const next = new Set(current);
      next.delete(jid);
      return next;
    });

  useCoreEvent('contact.requested', (request) => {
    seenAt.current.set(request.jid, new Date());
    show(request.jid);
    void refresh().catch(() => {});
  });
  useCoreEvent('contact.updated', () => void refresh().catch(() => {}));
  useCoreEvent('message.received', (message) => {
    if (message.direction === 'in') show(message.chatId);
  });

  const hide = useCallback((jid: string) => setHidden((current) => new Set(current).add(jid)), []);

  return { rows: requestRows(requests, chats, hidden, seenAt.current), refresh, hide };
}

/** The rows, one per JID, most recent first. */
export function requestRows(
  requests: ContactRequest[],
  chats: Chat[],
  hidden: ReadonlySet<string>,
  seenAt: ReadonlyMap<string, Date>,
): RequestRow[] {
  const rows = new Map<string, RequestRow>();
  for (const chat of chats) {
    if (!isRequest(chat) || hidden.has(chat.peerJid)) continue;
    rows.set(chat.peerJid, {
      jid: chat.peerJid,
      name: chat.title,
      requested: false,
      chat,
      at: chat.lastMessage?.sentAt ?? new Date(0),
    });
  }
  for (const request of requests) {
    if (hidden.has(request.jid)) continue;
    const fromChat = rows.get(request.jid);
    const seen = seenAt.get(request.jid) ?? new Date(0);
    const row: RequestRow = {
      jid: request.jid,
      name: request.name,
      requested: true,
      at: fromChat && fromChat.at > seen ? fromChat.at : seen,
    };
    if (request.message) row.message = request.message;
    if (fromChat?.chat) row.chat = fromChat.chat;
    rows.set(request.jid, row);
  }
  return [...rows.values()].sort((a, b) => b.at.getTime() - a.at.getTime());
}
