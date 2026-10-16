#!/bin/sh
# Cargo runner for debug runs on macOS (.cargo/config.toml): signs the binary with a stable
# identity of the developer's keychain, then runs it. The keychain ties its "Always Allow" to the
# signer, not to the binary's hash, so a rebuild or another worktree no longer asks for the
# password again. Picks `HEY_POSTIE_DEV_IDENTITY` if set, else the first "Apple Development"
# identity; without one, runs the binary unsigned, as before. Release builds never go through it.
binary="$1"
identity="${HEY_POSTIE_DEV_IDENTITY:-$(security find-identity -v -p codesigning 2>/dev/null |
  sed -n 's/.*"\(Apple Development: [^"]*\)".*/\1/p' | head -n 1)}"
if [ -n "$identity" ]; then
  codesign --force --sign "$identity" --identifier com.snouzylabs.heypostie.dev "$binary" 2>/dev/null ||
    echo "dev-sign-run: could not sign with \"$identity\", running unsigned" >&2
fi
exec "$@"
