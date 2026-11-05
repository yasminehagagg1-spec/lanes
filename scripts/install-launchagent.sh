#!/usr/bin/env bash
# Starts Lanes at login and restarts it if it crashes (a macOS LaunchAgent),
# and puts the `lanes` command on your PATH.
#
#   scripts/install-launchagent.sh              install (or update) and start
#   scripts/install-launchagent.sh --uninstall  stop and remove; your data stays
#
# Overrides (for testing): LANES_LABEL, LANES_AGENTS_DIR, LANES_BIN_DIR, LANES_DATA_DIR, LANES_PORT
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LABEL="${LANES_LABEL:-com.yasmine.lanes}"
AGENTS="${LANES_AGENTS_DIR:-$HOME/Library/LaunchAgents}"
BIN="${LANES_BIN_DIR:-$HOME/.local/bin}"
DATA="${LANES_DATA_DIR:-$HOME/Library/Application Support/Lanes}"
PORT="${LANES_PORT:-4747}"
PLIST="$AGENTS/$LABEL.plist"
DOMAIN="gui/$(id -u)"
CLI="$ROOT/scripts/lanes"

say() { printf '%s\n' "$*"; }
loaded() { launchctl print "$DOMAIN/$LABEL" >/dev/null 2>&1; }
health() { curl -sf --max-time 2 "http://127.0.0.1:$PORT/api/health" >/dev/null; }

if [ "${1:-}" = "--uninstall" ]; then
  loaded && launchctl bootout "$DOMAIN/$LABEL" && say "✓ stopped Lanes"
  [ -f "$PLIST" ] && rm "$PLIST" && say "✓ removed $PLIST"
  if [ -L "$BIN/lanes" ] && [ "$(readlink "$BIN/lanes")" = "$CLI" ]; then
    rm "$BIN/lanes" && say "✓ removed the lanes command"
  fi
  say "Your data is untouched: $DATA"
  exit 0
fi

# launchd doesn't load the shell PATH, so the agent gets node's absolute path.
NODE=""
for n in "$(command -v node 2>/dev/null || true)" "$HOME/.local/node/bin/node" /opt/homebrew/bin/node /usr/local/bin/node; do
  if [ -n "$n" ] && [ -x "$n" ]; then NODE="$n"; break; fi
done
[ -n "$NODE" ] || { say "✗ Node 22+ wasn't found."; exit 1; }
NODE="$(cd "$(dirname "$NODE")" && pwd -P)/$(basename "$NODE")"
"$NODE" -e 'process.exit(Number(process.versions.node.split(".")[0]) >= 22 ? 0 : 1)' \
  || { say "✗ Lanes needs Node 22 or newer ($("$NODE" -v))."; exit 1; }

say "Lanes → starts at login"
say "  node: $NODE"
say "  data: $DATA"
say ""

say "1. Building"
(cd "$ROOT" && PATH="$(dirname "$NODE"):$PATH" pnpm --silent build)
say "  ✓ built"

# A Lanes started by hand would hold the port and the agent would crash-loop.
if ! loaded && health; then
  if [ -f "$DATA/lanes.pid" ] && kill -0 "$(cat "$DATA/lanes.pid")" 2>/dev/null; then
    kill "$(cat "$DATA/lanes.pid")"; rm -f "$DATA/lanes.pid"
    for _ in $(seq 1 25); do health || break; sleep 0.2; done
  else
    say "✗ Lanes is already running on port $PORT (maybe pnpm start in a terminal). Stop it, then run this again."
    exit 1
  fi
fi

say ""
say "2. Login service"
mkdir -p "$AGENTS" "$DATA/logs"
xml() { printf '%s' "$1" | sed -e 's/&/\&amp;/g' -e 's/</\&lt;/g' -e 's/>/\&gt;/g'; }
cat >"$PLIST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$(xml "$LABEL")</string>
  <key>ProgramArguments</key>
  <array>
    <string>$(xml "$NODE")</string>
    <string>$(xml "$ROOT/packages/server/dist/index.js")</string>
  </array>
  <key>WorkingDirectory</key><string>$(xml "$ROOT")</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>LANES_PORT</key><string>$(xml "$PORT")</string>
    <key>LANES_DATA_DIR</key><string>$(xml "$DATA")</string>
    <key>PATH</key><string>$(xml "$(dirname "$NODE")"):/usr/bin:/bin:/usr/sbin:/sbin</string>
  </dict>
  <key>RunAtLoad</key><true/>
  <!-- Restart after a crash; a clean stop (lanes stop) stays stopped. -->
  <key>KeepAlive</key><dict><key>SuccessfulExit</key><false/></dict>
  <key>ThrottleInterval</key><integer>10</integer>
  <!-- The server writes its own log (logs/server.log); this catches crashes before it starts. -->
  <key>StandardOutPath</key><string>/dev/null</string>
  <key>StandardErrorPath</key><string>$(xml "$DATA/logs/launchd.err.log")</string>
</dict>
</plist>
PLIST
plutil -lint "$PLIST" >/dev/null
loaded && launchctl bootout "$DOMAIN/$LABEL" 2>/dev/null || true
for _ in $(seq 1 25); do loaded || break; sleep 0.2; done
launchctl bootstrap "$DOMAIN" "$PLIST"
say "  ✓ $PLIST"

ok=0
for _ in $(seq 1 50); do health && { ok=1; break; }; sleep 0.3; done
if [ "$ok" = 1 ]; then
  say "  ✓ Lanes is awake at http://localhost:$PORT"
else
  say "  ✗ Lanes didn't wake up. Look at $DATA/logs/launchd.err.log"
  exit 1
fi

say ""
say "3. The lanes command"
mkdir -p "$BIN"
ln -sf "$CLI" "$BIN/lanes"
case ":$PATH:" in
  *":$BIN:"*) say "  ✓ $BIN/lanes (try: lanes status)" ;;
  *) say "  ✓ $BIN/lanes — add $BIN to your PATH to use it from any folder" ;;
esac
