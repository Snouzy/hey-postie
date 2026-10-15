#!/usr/bin/env bash
# Create the two test accounts. Idempotent: an account that already exists is left untouched
# (`prosodyctl register` would silently overwrite it, password included, so we check the account
# file first). The server does not need to be running: prosodyctl writes the files directly.
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/env.sh"

register() {
	local user="$1" password="$2"
	if [ -f "data/localhost/accounts/$user.dat" ]; then
		echo "exists  $user@localhost"
		return
	fi
	"$PROSODY_PREFIX/bin/prosodyctl" --config "$CONFIG" register "$user" localhost "$password" >/dev/null 2>&1
	echo "created $user@localhost"
}

register alice alice-pw
register bob bob-pw
