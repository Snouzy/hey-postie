#!/usr/bin/env bash
# Wipe every account, roster, archive, room and PEP node of the local server and recreate the two
# test accounts. Use it when contract tests start failing because of state accumulated by manual
# sessions (stale bookmarks, OMEMO device lists, archived messages with reused ids).
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/env.sh"
here="$(dirname "${BASH_SOURCE[0]}")"

was_running=0
if [ -f data/prosody.pid ] && kill -0 "$(cat data/prosody.pid)" 2>/dev/null; then
	was_running=1
	bash "$here/stop.sh"
fi
# Keep the log and the pidfile folder; drop everything the server stored.
find data -mindepth 1 -maxdepth 1 ! -name 'prosody.log' -exec rm -rf {} +
echo "data wiped"
bash "$here/users.sh"
if [ "$was_running" = 1 ]; then
	bash "$here/start.sh" -d
fi
