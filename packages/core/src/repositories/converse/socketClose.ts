import type { ConnectionLike } from './models';

/**
 * Strophe discards the WebSocket close reason, and does nothing at all when the socket closes
 * cleanly before the stream opened (`strophe.js/src/websocket.js:360-378`). The relay closes with
 * reason `CertificateInvalid` in that very state, so we keep the reason (`onReason`) and turn such
 * a close into a CONNFAIL that Strophe then handles like any other. Returns false when the
 * transport has no `_onClose` to wrap (the BOSH mock of the tests).
 */
export function wrapSocketClose(
  connection: ConnectionLike,
  CONNFAIL: number,
  onReason: (reason: string) => void,
): boolean {
  const proto = connection._proto;
  const original = proto?._onClose;
  if (!proto || !original) return false;
  proto._onClose = (event: CloseEvent) => {
    onReason(event?.reason ?? '');
    if (!connection.connected && event?.code !== 1006) {
      connection._changeConnectStatus(CONNFAIL, event?.reason || 'closed');
      connection._doDisconnect();
      return;
    }
    original.call(proto, event);
  };
  return true;
}
