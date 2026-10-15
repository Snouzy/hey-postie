#!/usr/bin/env bash
# Start the local Prosody test server in the foreground (Ctrl-C stops it).
# Pass -d to daemonize instead; stop it with stop.sh.
#
# Not using `prosodyctl start`: it binds a Unix socket at data/notify.sock, and that path exceeds
# macOS's 104-byte socket path limit in a normal checkout, so it fails with "Notify failed".
# `prosody -D` daemonizes by itself and writes data/prosody.pid.
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/env.sh"

if [ ! -f certs/localhost+2.pem ]; then
	echo "No certificate in $XMPP_DIR/certs: run ./install.sh (it calls mkcert)." >&2
	exit 1
fi

if [ -f data/prosody.pid ] && kill -0 "$(cat data/prosody.pid)" 2>/dev/null; then
	echo "Prosody is already running (pid $(cat data/prosody.pid))." >&2
	exit 1
fi

if [ "${1:-}" = "-d" ]; then
	"$PROSODY_PREFIX/bin/prosody" --config "$CONFIG" -D 2>/dev/null
	sleep 1
	echo "Prosody started (pid $(cat data/prosody.pid)); log in $XMPP_DIR/data/prosody.log"
	exit 0
fi
exec "$PROSODY_PREFIX/bin/prosody" --config "$CONFIG"
