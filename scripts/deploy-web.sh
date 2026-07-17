#!/usr/bin/env bash
#
# Deploy the static web export to the `gh-pages` branch — no GitHub Actions.
# GitHub Pages serves that branch as-is (`.nojekyll` skips Jekyll processing).
# Run locally after committing:  pnpm run deploy:pages
#
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

# The site is served under https://<user>.github.io/<repo>/, so it needs a base path.
BASE_PATH="${DEPLOY_BASE_PATH:-/probooking}"
ORIGIN="$(git remote get-url origin)"
SRC_COMMIT="$(git rev-parse --short HEAD)"
OUT="$REPO_ROOT/apps/web/out"

# The build runs against the WORKING TREE, but the deploy commit claims a SHA. With local
# edits present, the published site is not reproducible from that commit — and the message
# says otherwise. Refuse rather than ship something git cannot account for.
if [ -n "$(git status --porcelain)" ]; then
  echo "✗ Working tree is dirty. Commit or stash first — the deploy commit records $SRC_COMMIT," >&2
  echo "  so publishing uncommitted changes would label the site with a commit that lacks them." >&2
  echo "  Override with ALLOW_DIRTY_DEPLOY=1 if you know what you're doing." >&2
  [ "${ALLOW_DIRTY_DEPLOY:-}" = "1" ] || exit 1
  echo "  … ALLOW_DIRTY_DEPLOY=1 set; continuing." >&2
fi

echo "▶ Building static export (basePath=$BASE_PATH)…"
NEXT_PUBLIC_BASE_PATH="$BASE_PATH" pnpm --filter @probook/web build

touch "$OUT/.nojekyll"

echo "▶ Publishing $OUT → gh-pages (force)…"
cd "$OUT"
rm -rf .git
git init -q
git checkout -q -b gh-pages
git add -A
git -c user.name="probooking-deploy" -c user.email="deploy@probooking.local" \
  commit -q -m "Deploy web from $SRC_COMMIT"
git push -f "$ORIGIN" gh-pages
rm -rf .git

echo "✓ Deployed. GitHub Pages will publish from the gh-pages branch shortly."
