#!/usr/bin/env bash
# Shared by start.sh, stop.sh and users.sh: locate the local Prosody build and its Lua rocks.
# Everything lives under tools/xmpp-server/; nothing is installed globally except Homebrew packages.

XMPP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROSODY_PREFIX="$XMPP_DIR/prosody"
ROCKS_TREE="$XMPP_DIR/rocks"
CONFIG="$XMPP_DIR/prosody.cfg.lua"

export LUA_PATH="$ROCKS_TREE/share/lua/5.4/?.lua;$ROCKS_TREE/share/lua/5.4/?/init.lua;;"
export LUA_CPATH="$ROCKS_TREE/lib/lua/5.4/?.so;;"

if [ ! -x "$PROSODY_PREFIX/bin/prosody" ]; then
	echo "Prosody is not built yet: run $XMPP_DIR/install.sh first." >&2
	exit 1
fi

# Relative paths in prosody.cfg.lua (data, certs) resolve from here.
cd "$XMPP_DIR" || exit 1
mkdir -p data
