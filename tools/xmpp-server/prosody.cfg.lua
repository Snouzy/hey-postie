-- Prosody configuration for the local Hey Postie test server.
-- Dev only: binds to localhost, in-band registration open, no S2S.
-- Reference: https://prosody.im/doc/configure (checked on 2026-10-15, Prosody 13.0.7).

-- Absolute directory of this file. Paths below are built from it because Prosody changes its
-- working directory to data_path after reading the config, while the log file is opened before
-- that change by the server and after it by prosodyctl: a relative path would point at two
-- different places. (`Lua.` is how a config file reaches the Lua standard library in Prosody 13.)
local here = Lua.debug.getinfo(1, "S").source:match("^@(.*)/") or "."
if here:sub(1, 1) ~= "/" then
	here = Lua.os.getenv("PWD") .. "/" .. here
end

-- Listen on loopback only: this server must never be reachable from the network.
interfaces = { "127.0.0.1", "::1" }
local_interfaces = { "127.0.0.1", "::1" }
http_interfaces = { "127.0.0.1", "::1" }
https_interfaces = { "127.0.0.1", "::1" }

-- Ports: 5222 STARTTLS, 5223 direct TLS, 5280 HTTP, 5281 HTTPS (WebSocket, file share).
c2s_ports = { 5222 }
c2s_direct_tls_ports = { 5223 }
http_ports = { 5280 }
https_ports = { 5281 }
s2s_ports = {}

data_path = here .. "/data"
pidfile = "prosody.pid" -- resolved from data_path

-- "info" only: no "debug", which would write stanzas (message bodies) to the log.
log = {
	{ levels = { min = "info" }, to = "file", filename = here .. "/data/prosody.log" },
}

-- mkcert certificates, trusted by this machine's keychain (see README).
ssl = {
	key = here .. "/certs/localhost+2-key.pem",
	certificate = here .. "/certs/localhost+2.pem",
}

c2s_require_encryption = true
s2s_require_encryption = true
allow_registration = true
authentication = "internal_hashed"

modules_enabled = {
	-- Generally required
	"disco",
	"roster",
	"saslauth",
	"tls",
	-- Not essential, but recommended
	"blocklist",
	"carbons",
	"pep",
	"private",
	"vcard4",
	"vcard_legacy",
	-- Nice to have
	"admin_shell", -- `prosodyctl shell` on the running server (user list, passwd, ...)
	"admin_socket",
	"csi_simple",
	"ping",
	"register",
	"smacks",
	"time",
	"uptime",
	"version",
	-- Message archive (XEP-0313), kept forever on this dev server
	"mam",
	-- WebSocket (RFC 7395) for the browser / Converse engine
	"websocket",
}

modules_disabled = {
	"dialback",
	"s2s",
}

-- MAM
archive_expires_after = "never"
default_archive_policy = true

-- WebSocket, served on https://localhost:5281/xmpp-websocket. CORS is allowed for any origin
-- (`cross_domain_websocket` is deprecated since 0.12; this is its replacement).
consider_websocket_secure = true
http_cors_override = { websocket = { enabled = true } }

-- This is a hand-started dev server, not a launchd service.
prosodyctl_service_warnings = false

-- Socket for `prosodyctl shell` (and passwd/deluser on a running server). The default lives in
-- data_path, whose absolute path exceeds macOS's 104-byte limit for Unix socket paths.
admin_socket = "/tmp/hey-postie-prosody.sock"

VirtualHost "localhost"

Component "upload.localhost" "http_file_share"
	http_file_share_size_limit = 10 * 1024 * 1024

Component "rooms.localhost" "muc"
	modules_enabled = { "muc_mam" }
