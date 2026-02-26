#!/bin/bash
# Usage:
#   ./mcp.sh           — start the MCP server (called by Claude)
#   ./mcp.sh setup     — install dependencies and register with Claude CLI
#   ./mcp.sh setup <name> <scope>
#       name  : MCP server name (default: project-agent)
#       scope : local | user | project (default: user)
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ─── helpers ────────────────────────────────────────────────────────────────

find_node() {
  if [ -s "$HOME/.nvm/nvm.sh" ]; then
    export NVM_DIR="$HOME/.nvm"
    # shellcheck disable=SC1091
    source "$NVM_DIR/nvm.sh" --no-use
    NVM_NODE="$(nvm which default 2>/dev/null || true)"
    [ -x "$NVM_NODE" ] && echo "$NVM_NODE" && return
  fi
  command -v node || { echo "ERROR: node not found" >&2; exit 1; }
}

find_tsx() {
  local local_tsx="$DIR/node_modules/.bin/tsx"
  if [ -x "$local_tsx" ]; then
    echo "$local_tsx"
  else
    command -v tsx 2>/dev/null || { echo "ERROR: tsx not found. Run: ./mcp.sh setup" >&2; exit 1; }
  fi
}

# ─── commands ───────────────────────────────────────────────────────────────

cmd_start() {
  if [ -f "$DIR/.env" ]; then
    set -a
    # shellcheck disable=SC1091
    source "$DIR/.env"
    set +a
  fi

  NODE="$(find_node)"
  TSX="$(find_tsx)"
  exec "$NODE" "$TSX" "$DIR/src/server.ts"
}

cmd_setup() {
  local name="${1:-project-agent}"
  local scope="${2:-user}"

  echo "=== github-issues-server MCP Setup ==="
  echo "  Server name : $name"
  echo "  Scope       : $scope"
  echo "  Dir         : $DIR"
  echo

  echo "[1/3] Installing dependencies..."
  cd "$DIR" && npm install
  echo "      Done."
  echo

  echo "[2/3] Registering MCP server with Claude CLI..."
  for s in local user project; do
    claude mcp remove -s "$s" "$name" 2>/dev/null && echo "      Removed old '$s' registration." || true
  done
  claude mcp add -s "$scope" -- "$name" "$DIR/mcp.sh"
  echo "      Registered '$name' (scope: $scope)."
  echo

  echo "[3/3] Verifying..."
  claude mcp list
  echo
  echo "=== Setup complete! ==="
  echo "  Restart PhpStorm / Claude Desktop to pick up the new server."
}

# ─── dispatch ───────────────────────────────────────────────────────────────

case "${1:-}" in
  setup) cmd_setup "${2:-}" "${3:-}" ;;
  "")    cmd_start ;;
  *)
    echo "Usage: $0 [setup [name] [scope]]" >&2
    exit 1
    ;;
esac
