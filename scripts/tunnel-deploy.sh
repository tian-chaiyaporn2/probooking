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

# --- Preflight: never publish a dev-mode API to the internet -------------------------
#
# This tunnel makes the local API — and the real database behind it — reachable by anyone
# with the URL. CORS does not protect it: CORS is enforced by browsers and means nothing to
# curl. So we probe the actual running API rather than trusting how it was configured.

# 1. The dev-token endpoint mints internal-role tokens with no authentication. If it is
#    routed, anyone with the tunnel URL is an administrator.
DEV_TOKEN_STATUS="$(curl -s -o /dev/null -w '%{http_code}' -X POST \
  -H 'Content-Type: application/json' -d '{"role":"operations"}' \
  "http://localhost:${API_PORT}/auth/dev/token" || echo 000)"
if [ "$DEV_TOKEN_STATUS" != "404" ]; then
  cat >&2 <<EOF
✗ Refusing to tunnel: POST /auth/dev/token responded ${DEV_TOKEN_STATUS} (expected 404).

  That endpoint hands an operations/administrator token to any unauthenticated caller.
  Exposing it publicly gives anyone with the tunnel URL full control of Operations and
  Finance — against your real local database.

  Restart the API with AUTH_DEV_MODE unset (and a strong JWT_SECRET) before tunnelling.
EOF
  exit 1
fi

# 2. An API that reflects any Origin has no browser-side lockdown at all. The docs claimed
#    this was pinned; nothing in this script ever set it, so check instead of assuming.
if curl -s -D - -o /dev/null -H 'Origin: https://not-our-site.example' \
     "http://localhost:${API_PORT}/health" | grep -qi '^access-control-allow-origin'; then
  cat >&2 <<EOF
✗ Refusing to tunnel: the API allows arbitrary browser origins.

  Set CORS_ORIGINS to the Pages origin before tunnelling, e.g.
    CORS_ORIGINS=https://tian-chaiyaporn2.github.io
EOF
  exit 1
fi

echo "  preflight: dev-token route absent, CORS pinned ✓"

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
