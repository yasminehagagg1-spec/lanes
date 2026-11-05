#!/usr/bin/env bash
# Connects Lanes to Claude: the MCP server in the Claude desktop app and Claude Code,
# plus the /task skill. Safe to run again; it only touches Lanes' own entries.
#
#   scripts/connect-claude.sh            do it
#   scripts/connect-claude.sh --dry-run  show what would change
#   scripts/connect-claude.sh --force    replace a ~/.claude/skills/task that isn't Lanes'
#
# Overrides (for testing): CLAUDE_DESKTOP_CONFIG, CLAUDE_SKILLS_DIR, LANES_SKIP_CLAUDE_CLI=1
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DRY=0; FORCE=0
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY=1 ;;
    --force) FORCE=1 ;;
    *) echo "Unknown option: $arg" >&2; exit 1 ;;
  esac
done

LANES_URL="http://127.0.0.1:4747"
ENTRY="$ROOT/packages/mcp/dist/index.js"
DESKTOP_CONFIG="${CLAUDE_DESKTOP_CONFIG:-$HOME/Library/Application Support/Claude/claude_desktop_config.json}"
SKILLS_DIR="${CLAUDE_SKILLS_DIR:-$HOME/.claude/skills}"
SKILL_SRC="$ROOT/claude/skills/task"
ZIP="$ROOT/dist/lanes-task-skill.zip"
HELPER="$ROOT/scripts/lib/connect.mjs"

say() { printf '%s\n' "$*"; }
# Dry-run notes go to stderr so they still show when a command's own output is hidden.
run() { if [ "$DRY" = 1 ]; then say "  ~ would run: $*" >&2; else "$@"; fi; }

# GUI apps don't load the shell PATH, so the config gets node's absolute path.
NODE="$(command -v node || true)"
if [ -z "$NODE" ]; then
  say "✗ node isn't on PATH. Install Node 22+ (or add ~/.local/node/bin to PATH) and run again."; exit 1
fi
NODE="$(cd "$(dirname "$NODE")" && pwd -P)/$(basename "$NODE")"
if ! "$NODE" -e 'process.exit(Number(process.versions.node.split(".")[0]) >= 22 ? 0 : 1)'; then
  say "✗ Lanes needs Node 22 or newer ($NODE is $("$NODE" -v))."; exit 1
fi

say "Lanes → Claude"
say "  node:  $NODE"
say "  entry: $ENTRY"
say ""

# 1. Build the MCP server.
say "1. Building the connector"
if [ "$DRY" = 1 ]; then
  say "  ~ would build @lanes/shared and @lanes/mcp"
else
  PNPM="$(command -v pnpm || true)"
  if [ -z "$PNPM" ]; then say "  ✗ pnpm isn't on PATH."; exit 1; fi
  (cd "$ROOT" && "$PNPM" --silent --filter @lanes/shared --filter @lanes/mcp build)
  [ -f "$ENTRY" ] || { say "  ✗ build didn't produce $ENTRY"; exit 1; }
  say "  ✓ built"
fi

# 2. Claude desktop app.
say ""
say "2. Claude desktop app"
if [ -d "$(dirname "$DESKTOP_CONFIG")" ]; then
  "$NODE" "$HELPER" desktop-config "$DESKTOP_CONFIG" "$NODE" "$ENTRY" "$LANES_URL" $([ "$DRY" = 1 ] && echo --dry-run)
else
  say "  – Claude desktop isn't installed (no $(dirname "$DESKTOP_CONFIG")). Skipped."
fi

# 3. Claude Code.
say ""
say "3. Claude Code"
CLAUDE="$(command -v claude || true)"
if [ "${LANES_SKIP_CLAUDE_CLI:-0}" = 1 ]; then
  say "  – skipped (LANES_SKIP_CLAUDE_CLI=1)"
elif [ -z "$CLAUDE" ]; then
  say "  – the claude CLI isn't on PATH. Skipped the MCP server; the skill is still installed below."
else
  if "$CLAUDE" mcp get lanes >/dev/null 2>&1; then
    run "$CLAUDE" mcp remove --scope user lanes >/dev/null
    VERB="updated"
  else
    VERB="added"
  fi
  # The name goes first: -e takes every argument after it up to the "--".
  run "$CLAUDE" mcp add lanes --scope user --transport stdio -e "LANES_URL=$LANES_URL" -- "$NODE" "$ENTRY" >/dev/null
  [ "$DRY" = 1 ] || say "  ✓ $VERB the \"lanes\" MCP server (user scope, all projects)"
fi

# 4. The /task skill.
say ""
say "4. The /task skill"
DEST="$SKILLS_DIR/task"
if [ -e "$DEST" ] && ! grep -q 'lanes-skill:' "$DEST/SKILL.md" 2>/dev/null; then
  if [ "$FORCE" = 1 ]; then
    BACKUP="$DEST.backup-$(date +%Y%m%d-%H%M%S)"
    run mv "$DEST" "$BACKUP"
    say "  · moved your existing task skill to $BACKUP"
  else
    say "  ✗ $DEST already exists and isn't Lanes'. Left it alone (use --force to replace it, with a backup)."
    exit 1
  fi
fi
run mkdir -p "$SKILLS_DIR"
run rm -rf "$DEST"
run cp -R "$SKILL_SRC" "$DEST"
[ "$DRY" = 1 ] || say "  ✓ Claude Code: installed $DEST"

if [ "$DRY" = 1 ]; then
  say "  ~ would build $ZIP for the desktop app"
else
  TMP="$(mktemp -d)"
  trap 'rm -rf "$TMP"' EXIT
  mkdir -p "$TMP/task" "$(dirname "$ZIP")"
  "$NODE" "$HELPER" desktop-skill "$SKILL_SRC/SKILL.md" "$TMP/task/SKILL.md"
  rm -f "$ZIP"
  (cd "$TMP" && zip -qrX "$ZIP" task)
  say "  ✓ desktop app: built $ZIP"
fi

say ""
say "Next:"
say "  • Restart the Claude desktop app, then upload dist/lanes-task-skill.zip in"
say "    Settings → Capabilities → Skills (needs “Code execution and file creation” on)."
say "  • Keep Lanes running (lanes start), then type: /task send Kitebird the banners tomorrow 3pm"
