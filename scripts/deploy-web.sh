#!/usr/bin/env bash
#
# Deploy the static web export to the `gh-pages` branch — no GitHub Actions.
# GitHub Pages serves that branch as-is (`.nojekyll` skips Jekyll processing).
# Run locally after committing:  pnpm deploy
#
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

# The site is served under https://<user>.github.io/<repo>/, so it needs a base path.
BASE_PATH="${DEPLOY_BASE_PATH:-/probooking}"
ORIGIN="$(git remote get-url origin)"
SRC_COMMIT="$(git rev-parse --short HEAD)"
OUT="$REPO_ROOT/apps/web/out"

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
