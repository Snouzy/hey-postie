#!/usr/bin/env bash
# Stop a Prosody started with start.sh -d (SIGTERM to the pid in data/prosody.pid).
# See start.sh for why prosodyctl stop is not used.
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/env.sh"

if [ ! -f data/prosody.pid ]; then
	echo "No pidfile: Prosody is not running." >&2
	exit 1
fi
pid="$(cat data/prosody.pid)"
kill "$pid"
for _ in 1 2 3 4 5 6 7 8 9 10; do
	kill -0 "$pid" 2>/dev/null || { echo "Prosody stopped (pid $pid)."; exit 0; }
	sleep 0.5
done
echo "Prosody (pid $pid) did not stop within 5 s." >&2
exit 1
