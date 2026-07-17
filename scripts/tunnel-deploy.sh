#!/usr/bin/env bash
#
# Demo mode: expose the LOCAL api over a public HTTPS tunnel and point the GitHub
# Pages frontend at it, so a few external people can use the live site against your
# laptop's API + database. One command; keep the terminal open for the tunnel's life.
#
# Prereqs (already-running):  local API on :4000  +  Postgres.
# Every run gets a NEW tunnel URL and redeploys automatically (URLs are ephemeral).
#
#   bash scripts/tunnel-deploy.sh
#
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"
API_PORT="${API_PORT:-4000}"
LOG="$(mktemp)"

command -v ssh >/dev/null || { echo "✗ ssh not found"; exit 1; }
curl -sf "http://localhost:${API_PORT}/health" >/dev/null \
  || { echo "✗ local API not responding on :${API_PORT} — start it first"; exit 1; }

echo "▶ Opening localhost.run tunnel → :${API_PORT} …"
ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null \
    -o ServerAliveInterval=30 -o ExitOnForwardFailure=yes \
    -R "80:localhost:${API_PORT}" nokey@localhost.run > "$LOG" 2>&1 &
TUNNEL_PID=$!
trap 'kill "$TUNNEL_PID" 2>/dev/null || true' EXIT

URL=""
for _ in $(seq 1 30); do
  URL="$(grep -oiE 'https://[a-z0-9-]+\.lhr\.life' "$LOG" | head -1 || true)"
  [ -n "$URL" ] && break
  sleep 1
done
[ -n "$URL" ] || { echo "✗ tunnel URL not found:"; cat "$LOG"; exit 1; }
echo "  tunnel: $URL"
curl -sf "$URL/health" >/dev/null || { echo "✗ tunnel is not reaching the API"; exit 1; }

echo "▶ Redeploying the frontend pointed at the tunnel …"
NEXT_PUBLIC_API_BASE_URL="$URL" bash "$REPO_ROOT/scripts/deploy-web.sh"

cat <<EOF

✓ Live for external testers: https://tian-chaiyaporn2.github.io/probooking/
  API tunnel : $URL
  (Pages CDN may take ~1 min to serve the new build.)

Keep this terminal open — closing it drops the tunnel and the live site stops
working until you run this again (which mints a fresh URL + redeploys).
EOF

wait "$TUNNEL_PID"
