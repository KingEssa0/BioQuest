#!/usr/bin/env bash
# One-command demo launcher: starts the backend and a public HTTPS tunnel
# to it, so any phone can reach it regardless of venue wifi restrictions.
# Ctrl+C stops both.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$SCRIPT_DIR/backend"
PORT="${PORT:-5050}"

CLOUDFLARED="$(command -v cloudflared || echo "$HOME/.local/bin/cloudflared")"
if [ ! -x "$CLOUDFLARED" ]; then
  echo "cloudflared not found. Install it from https://github.com/cloudflare/cloudflared/releases"
  exit 1
fi

cleanup() {
  echo ""
  echo "Stopping..."
  kill "$FLASK_PID" "$TUNNEL_PID" 2>/dev/null || true
  wait 2>/dev/null || true
}
trap cleanup EXIT INT TERM

EXISTING_PID="$(lsof -ti tcp:"$PORT" -sTCP:LISTEN 2>/dev/null || true)"
if [ -n "$EXISTING_PID" ]; then
  echo "Port $PORT is already in use (pid $EXISTING_PID) — stopping it first."
  kill -9 $EXISTING_PID 2>/dev/null || true
  sleep 1
fi

echo "Starting BioQuest backend on port $PORT..."
(
  cd "$BACKEND_DIR"
  source .venv/bin/activate
  PORT="$PORT" python app.py
) &
FLASK_PID=$!

# Wait for the server to actually be answering before tunneling to it.
for _ in $(seq 1 30); do
  if curl -sf "http://localhost:$PORT/" > /dev/null 2>&1; then
    break
  fi
  sleep 0.5
done

echo "Starting public tunnel..."
"$CLOUDFLARED" tunnel --url "http://localhost:$PORT" 2>&1 &
TUNNEL_PID=$!

# The public URL is printed by cloudflared itself above — watch for the
# line containing trycloudflare.com. Give it a moment to appear.
sleep 5
echo ""
echo "======================================================================"
echo " Local:  http://localhost:$PORT"
echo " Public URL is printed above (look for the *.trycloudflare.com line)"
echo " Press Ctrl+C to stop"
echo "======================================================================"

wait
