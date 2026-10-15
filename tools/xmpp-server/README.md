# Local XMPP test server

A Prosody 13 server running on this Mac, for development and for the contract tests gated by
`XMPP_TEST_SERVER`. XMPP domain `localhost`, TLS trusted by the machine, in-band registration open.

**Dev only.** It listens on `127.0.0.1` and `::1` exclusively, registration is open to anyone who can
reach it, and the test passwords are in this file. Never expose it or reuse this configuration for a
real server.

## Install

Homebrew has no Prosody formula (checked on 2026-10-15), so `install.sh` builds it from the official
release tarball. Everything lands in this folder; only the Homebrew packages are global.

```sh
tools/xmpp-server/install.sh
```

What it does, in order:

1. `brew install lua@5.4 luarocks openssl@3 icu4c@78 mkcert` (skips what is present).
2. Downloads `prosody-13.0.7.tar.gz` into a fresh temp dir, checks it is a gzip archive (`file`)
   and that its SHA-256 matches the hash pinned in the script. The release signature
   (`.tar.gz.asc`, key `32A9EDDE3609931EB98CEAC315907E8E7BDD6BFE`, Matthew Wild) was verified by
   hand on 2026-10-15 (`gpg: Good signature`, key reported as expired by gpg).
3. Patches `util-src/pposix.c`: 13.0.7 references the Linux-only `O_DIRECT` in a table that is only
   read on Linux; upstream trunk already guards it with `#if !defined(__APPLE__)`.
4. `./configure` with Homebrew's Lua 5.4, ICU and OpenSSL, then `make && make install` into
   `prosody/`. The `--ostype=macosx` preset is not used because it overwrites `LDFLAGS` and loses
   the `-L` paths to ICU and OpenSSL; the script passes the preset's link flags itself.
5. `luarocks --tree rocks/ install luasocket luaexpat luafilesystem luasec`.
6. `mkcert localhost 127.0.0.1 ::1` into `certs/` if no certificate is there yet.

`prosody/`, `rocks/`, `certs/` and `data/` are git-ignored.

Versions observed on 2026-10-15: Prosody 13.0.7, Lua 5.4.9, LuaSocket 3.1.0 (reports 3.0.0),
LuaExpat 1.5.2, LuaFileSystem 1.9.0, LuaSec 1.3.2, OpenSSL 3.5.9, expat 2.7.4 (macOS SDK),
ICU 78.3, luarocks 3.13.0, mkcert 1.4.4.

## Certificates

`mkcert` creates a local certificate authority in `~/Library/Application Support/mkcert/` and signs
`certs/localhost+2.pem` with it (valid for `localhost`, `127.0.0.1`, `::1`). For the system, browsers
and the app to trust it, the CA must be in the macOS System keychain, which `mkcert -install` does
once (it asks for your password; `install.sh` tells you when it is still needed):

```sh
mkcert -install
```

Command-line OpenSSL and curl do not read the keychain: pass the CA explicitly, as the checks below
do (`-CAfile "$(mkcert -CAROOT)/rootCA.pem"`, `--cacert ...`). Without it they report
`Verify return code: 21 (unable to verify the first certificate)`, which is expected.

## Start, stop, accounts

```sh
tools/xmpp-server/users.sh       # creates alice and bob, idempotent
tools/xmpp-server/start.sh       # foreground, Ctrl-C to stop
tools/xmpp-server/start.sh -d    # daemon; then:
tools/xmpp-server/stop.sh
```

| Account | Password |
|---|---|
| `alice@localhost` | `alice-pw` |
| `bob@localhost` | `bob-pw` |

Log: `data/prosody.log`, level `info` only (no stanzas, so no message bodies). Pidfile:
`data/prosody.pid`.

Talk to the running server with `prosodyctl shell` (source `env.sh` first to get the Lua paths):

```sh
source tools/xmpp-server/env.sh
"$PROSODY_PREFIX/bin/prosodyctl" --config "$CONFIG" shell user list localhost
"$PROSODY_PREFIX/bin/prosodyctl" --config "$CONFIG" passwd alice@localhost
```

`prosodyctl start/stop` are not used: they bind a Unix socket inside `data/`, and that path is
longer than macOS's 104-byte limit for socket paths in a normal checkout ("Notify failed"). For the
same reason the admin socket is at `/tmp/hey-postie-prosody.sock`.

## Contract tests

`packages/core/src/repositories/converse/contract.test.ts` drives the Converse repositories against
this server as `alice`, with `bob` as a raw WebSocket client. It is skipped unless `XMPP_TEST_SERVER`
is set; the `test:contract` script of `@hey-postie/core` sets it to the WebSocket URL above. The test
runs in Node (jsdom), whose TLS does not read the keychain: pass the mkcert CA explicitly.

```sh
tools/xmpp-server/start.sh -d && tools/xmpp-server/users.sh
NODE_EXTRA_CA_CERTS="$(mkcert -CAROOT)/rootCA.pem" pnpm --filter @hey-postie/core test:contract
```

Without `NODE_EXTRA_CA_CERTS` the suite fails in `beforeAll` with `bob: WebSocket error` (the TLS
handshake rejects the mkcert certificate; observed on 2026-10-15). The server keeps the roster and the message archive between runs; the test
tolerates that (unique ids per run, cleanup of bob's roster), so wiping `data/` is not needed.

## Ports and features

| Port | What |
|---|---|
| 5222 | XMPP client, STARTTLS required (`c2s_require_encryption`) |
| 5223 | XMPP client, direct TLS |
| 5280 | HTTP |
| 5281 | HTTPS: WebSocket at `/xmpp-websocket`, file share for `upload.localhost` |

Hosts: `localhost` (accounts), `rooms.localhost` (MUC, with `muc_mam`), `upload.localhost`
(`http_file_share`, 10 MiB per file). Modules: roster, saslauth, tls, disco, carbons, pep, private,
blocklist, vcard4, vcard_legacy, version, uptime, time, ping, register (XEP-0077, open), mam
(kept forever, archiving on by default), csi_simple, smacks, websocket, admin_shell, admin_socket.
Server-to-server (`s2s`, `dialback`) is disabled. See `prosody.cfg.lua`; the WebSocket CORS option
is `http_cors_override` (`cross_domain_websocket` is deprecated in Prosody 13).

## Verification (observed on 2026-10-15)

```
$ tools/xmpp-server/start.sh -d
Prosody started (pid 62429); log in .../tools/xmpp-server/data/prosody.log

$ lsof -nP -iTCP:5222 -iTCP:5223 -iTCP:5280 -iTCP:5281 -sTCP:LISTEN | awk 'NR>1{print $9}'
[::1]:5222 [::1]:5223 [::1]:5280 [::1]:5281
127.0.0.1:5222 127.0.0.1:5223 127.0.0.1:5280 127.0.0.1:5281

$ CA="$(mkcert -CAROOT)/rootCA.pem"
$ openssl s_client -connect localhost:5222 -starttls xmpp -xmpphost localhost -CAfile "$CA" </dev/null 2>&1 \
    | grep -E "Verify return code|subject=|^Protocol"
subject=O=mkcert development certificate, OU=<user>@<host> (<name>)
Protocol: TLSv1.3
Verify return code: 0 (ok)

$ openssl s_client -connect localhost:5223 -servername localhost -CAfile "$CA" </dev/null 2>&1 \
    | grep -E "Verify return code|^Protocol"
Protocol: TLSv1.3
Verify return code: 0 (ok)

$ curl -sk https://localhost:5281/xmpp-websocket -o /dev/null -w "%{http_code}\n"
200                      # Prosody answers a plain GET with an info page; the upgrade is what matters:
$ curl -s --cacert "$CA" -i -H 'Connection: Upgrade' -H 'Upgrade: websocket' \
    -H 'Sec-WebSocket-Version: 13' -H 'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==' \
    -H 'Sec-WebSocket-Protocol: xmpp' --max-time 2 https://localhost:5281/xmpp-websocket | head -1
HTTP/1.1 101 Switching Protocols

$ tools/xmpp-server/users.sh
exists  alice@localhost
exists  bob@localhost
$ "$PROSODY_PREFIX/bin/prosodyctl" --config "$CONFIG" shell user list localhost
alice@localhost
bob@localhost
OK: Showing all 2 users

$ tools/xmpp-server/stop.sh
Prosody stopped (pid 62429).
```

`prosodyctl check config` reports `All checks passed`. Launching from the repo root with a relative
path also works (`prosody/bin/prosody --config tools/xmpp-server/prosody.cfg.lua`, with `env.sh`
sourced): the config turns its own location into an absolute path.

## Wipe the data

Stop the server, then delete `data/` (accounts, archives, uploads, log) and run `users.sh` again:

```sh
tools/xmpp-server/stop.sh
trash tools/xmpp-server/data    # or rm -r
tools/xmpp-server/users.sh
```

To rebuild Prosody itself, run `install.sh` again; it replaces `prosody/` and `rocks/`.

## Known limits

- `prosodyctl` prints a "Prosody was unable to find lua-unbound" banner on every run. Harmless: the
  built-in resolver is enough for `localhost`.
- `prosodyctl register` silently overwrites an existing account, password included; `users.sh`
  checks for the account file first.
- `mkcert -install` and anything that writes the System keychain needs an interactive `sudo`.
