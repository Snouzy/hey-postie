#!/usr/bin/env bash
# Build Prosody from the official release tarball into tools/xmpp-server/prosody/ and install its
# Lua libraries into tools/xmpp-server/rocks/. Both folders are git-ignored. Nothing is installed
# globally except the Homebrew packages listed below. Re-running the script rebuilds everything.
#
# Why a source build: Homebrew has no prosody formula (checked on 2026-10-15), and we want the same
# server version on every machine without Docker.
set -euo pipefail

XMPP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROSODY_VERSION="13.0.7"
# Pinned on 2026-10-15 from https://prosody.im/downloads/source/prosody-13.0.7.tar.gz.
# The release signature (prosody-13.0.7.tar.gz.asc, key 32A9EDDE3609931EB98CEAC315907E8E7BDD6BFE,
# Matthew Wild) was verified once by hand; the script checks this hash instead of needing GPG.
PROSODY_SHA256="f671df3c7535c7269afc89579ea26fc13d1006b40ef5df4ccb71a560197f151b"
TARBALL_URL="https://prosody.im/downloads/source/prosody-${PROSODY_VERSION}.tar.gz"

BREW_PACKAGES=(lua@5.4 luarocks openssl@3 icu4c@78 mkcert)
LUA_DIR="$(brew --prefix lua@5.4 2>/dev/null || echo /opt/homebrew/opt/lua@5.4)"
ICU_DIR="$(brew --prefix icu4c@78 2>/dev/null || echo /opt/homebrew/opt/icu4c@78)"
SSL_DIR="$(brew --prefix openssl@3 2>/dev/null || echo /opt/homebrew/opt/openssl@3)"

step() { printf '\n==> %s\n' "$*"; }

step "Homebrew packages"
missing=()
for pkg in "${BREW_PACKAGES[@]}"; do
	brew list --versions "$pkg" >/dev/null 2>&1 || missing+=("$pkg")
done
if [ "${#missing[@]}" -gt 0 ]; then
	brew install "${missing[@]}"
fi
brew list --versions "${BREW_PACKAGES[@]}"

step "Download prosody-${PROSODY_VERSION}.tar.gz"
# Fresh, empty temp dir: the archive is untrusted data until its hash is checked.
WORK="$(mktemp -d "${TMPDIR:-/tmp}/prosody-build.XXXXXX")"
trap 'rm -rf "$WORK"' EXIT
cd "$WORK"
curl -sSfL "$TARBALL_URL" -o prosody.tar.gz
file prosody.tar.gz | grep -q "gzip compressed data" || { echo "not a gzip archive" >&2; exit 1; }
echo "${PROSODY_SHA256}  prosody.tar.gz" | shasum -a 256 -c -
tar xzf prosody.tar.gz
cd "prosody-${PROSODY_VERSION}"

step "Patch util-src/pposix.c for macOS"
# 13.0.7 references O_DIRECT (Linux-only) in a table that is read only under #if defined(__linux__).
# Upstream trunk guards the two Linux flags with #if !defined(__APPLE__); this is the minimal
# equivalent until that lands in a 13.x release.
perl -0pi -e 's/(const int pipe_flag_values\[\] = \{)/#ifndef O_DIRECT\n#define O_DIRECT 0 \/* macOS: the table is only read on Linux *\/\n#endif\n$1/' util-src/pposix.c
grep -q '#define O_DIRECT 0' util-src/pposix.c

step "Configure"
# Not using --ostype=macosx: that preset unconditionally overwrites LDFLAGS (configure line ~273),
# which drops the -L paths to Homebrew's ICU and OpenSSL. We pass what the preset would set
# (bundle link flags, Lua dirs) ourselves instead. --runwith takes the absolute Lua binary because
# Homebrew's keg-only lua@5.4 is not on PATH.
./configure \
	--prefix="$XMPP_DIR/prosody" \
	--with-lua="$LUA_DIR" \
	--with-lua-include="$LUA_DIR/include/lua5.4" \
	--with-lua-lib="$LUA_DIR/lib" \
	--lua-version=5.4 \
	--runwith="$LUA_DIR/bin/lua" \
	--c-compiler=cc \
	--linker=cc \
	--add-cflags="-I$ICU_DIR/include -I$SSL_DIR/include" \
	--ldflags="-bundle -undefined dynamic_lookup -L$ICU_DIR/lib -L$SSL_DIR/lib" \
	--no-example-certs

step "Build and install into $XMPP_DIR/prosody"
rm -rf "$XMPP_DIR/prosody"
make
make install

step "Lua rocks into $XMPP_DIR/rocks"
rm -rf "$XMPP_DIR/rocks"
luarocks_local=(luarocks --lua-version 5.4 --lua-dir "$LUA_DIR" --tree "$XMPP_DIR/rocks")
for rock in luasocket luaexpat luafilesystem; do
	"${luarocks_local[@]}" install "$rock"
done
"${luarocks_local[@]}" install luasec OPENSSL_DIR="$SSL_DIR"

step "Certificates (mkcert)"
# One certificate for the account host and both components: http_file_share hands out
# https://upload.localhost:5281/... URLs and mod_http routes by Host header. File names are fixed
# so prosody.cfg.lua does not depend on the number of names. Regenerated on every run.
mkdir -p "$XMPP_DIR/certs"
(cd "$XMPP_DIR/certs" && mkcert -cert-file localhost+2.pem -key-file localhost+2-key.pem \
	localhost upload.localhost rooms.localhost 127.0.0.1 ::1)
if ! security find-certificate -c "mkcert" /Library/Keychains/System.keychain >/dev/null 2>&1; then
	cat <<'EOF'

The mkcert root CA is not in the System keychain yet. Run once (asks for your password):

    mkcert -install

EOF
fi

step "Check"
export LUA_PATH="$XMPP_DIR/rocks/share/lua/5.4/?.lua;$XMPP_DIR/rocks/share/lua/5.4/?/init.lua;;"
export LUA_CPATH="$XMPP_DIR/rocks/lib/lua/5.4/?.so;;"
"$XMPP_DIR/prosody/bin/prosodyctl" --config "$XMPP_DIR/prosody.cfg.lua" about 2>/dev/null | sed -n '/^Prosody /p;/# Lua module versions/,/^$/p'
echo "Done. Next: ./users.sh then ./start.sh"
