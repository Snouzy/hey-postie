import type { ChatModel, MessageModel } from './models';

/**
 * Incoming XEP-0333 read markers for our own letters. Converse 14 keeps the id a marker points at
 * but not its type, and stores what it finds under a literal `field_name` key
 * (`plugins/chat/model.js:226-231`), so the "read" stamp never showed. Here: the type is read from
 * the stanza (or from the decrypted OMEMO content), and a peer's `displayed` marker moves a "read
 * line" kept on the chat: every letter of ours at or before it has been read.
 */

const MARKERS_NS = 'urn:xmpp:chat-markers:0';
/** Lowest to highest acknowledgement: a stanza carrying two keeps the highest, as Converse does. */
const MARKER_TYPES = ['received', 'displayed', 'acknowledged'] as const;
export type MarkerType = (typeof MARKER_TYPES)[number];

/** The chat attribute holding the time of our latest letter the peer has displayed (ISO 8601). */
export const READ_UNTIL = 'read_until';

/**
 * The marker a message carries, as a direct child of the stanza or inside the `<payload>` of an
 * OMEMO 2 content (XEP-0420). Nothing deeper: a forwarded or quoted stanza is not ours to read.
 */
export function chatMarker(element: Element): { type: MarkerType; id: string } | null {
  const payloads = [...element.children].filter((child) => child.localName === 'payload');
  const candidates = [element, ...payloads].flatMap((parent) => [...parent.children]);
  let found: { type: MarkerType; id: string } | null = null;
  for (const child of candidates) {
    const type = MARKER_TYPES.find((name) => name === child.localName);
    const inNamespace =
      child.namespaceURI === MARKERS_NS || child.getAttribute('xmlns') === MARKERS_NS;
    const id = child.getAttribute('id');
    if (!type || !inNamespace || !id) continue;
    if (!found || MARKER_TYPES.indexOf(type) > MARKER_TYPES.indexOf(found.type)) {
      found = { type, id };
    }
  }
  return found;
}

/**
 * A Converse parse hook (`parseMessage`, `parseEncryptedContent`): adds `marker_type` to the
 * attributes, in place, as Converse's own hooks do. Errors and anything unexpected pass through.
 */
export function addMarkerType(element: unknown, attrs: unknown): unknown {
  if (!(element instanceof Element) || !attrs || typeof attrs !== 'object') return attrs;
  if (attrs instanceof Error) return attrs;
  const marker = chatMarker(element);
  if (marker) Object.assign(attrs, { marker_type: marker.type });
  return attrs;
}

/**
 * Moves the read line of a direct chat on a live `displayed` (or `acknowledged`) marker from the
 * peer, never backwards. Returns our letters that just became read, for the caller to announce.
 * A marker from our own other device (a carbon, `sender: 'me'`) or for an unknown id moves nothing.
 */
export function applyReadMarker(chat: ChatModel, attrs: Record<string, unknown>): MessageModel[] {
  if (attrs.marker_type !== 'displayed' && attrs.marker_type !== 'acknowledged') return [];
  if (attrs.sender !== 'them' || attrs.is_archived || typeof attrs.marker_id !== 'string') {
    return [];
  }
  const id = attrs.marker_id;
  const ours = chat.messages.models.filter((model) => model.get('sender') === 'me');
  const target = ours.find((model) => model.get('msgid') === id || model.get('origin_id') === id);
  const time = millis(target?.get('time'));
  const previous = millis(chat.get(READ_UNTIL));
  if (time === null || (previous !== null && time <= previous)) return [];
  chat.save({ [READ_UNTIL]: new Date(time).toISOString() });
  return ours.filter((model) => {
    const at = millis(model.get('time'));
    return at !== null && at <= time && (previous === null || at > previous);
  });
}

/** Whether a letter of ours sent at `sentAt` (ISO 8601) is at or before the chat's read line. */
export function isRead(sentAt: unknown, readUntil: unknown): boolean {
  const sent = millis(sentAt);
  const line = millis(readUntil);
  return sent !== null && line !== null && sent <= line;
}

/** An ISO 8601 time in milliseconds; null when absent or unreadable. */
export function millis(value: unknown): number | null {
  if (typeof value !== 'string') return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}
