# Deployment

## What deploys where

GitHub Pages serves **static files only**. This monorepo splits into:

| Part | Can host on Pages? | Where it goes |
|---|---|---|
| `apps/web` (Next.js frontend) | ✅ yes — static export | GitHub Pages (`gh-pages` branch) |
| `apps/api` (NestJS) | ❌ no — needs a Node server | a real host (Render/Railway/Fly/VM) |
| `packages/db` (Postgres) | ❌ no — needs a database | a managed Postgres |
| `apps/worker` | ❌ no — long-running process | a worker host / cron |

So the Pages deploy is **frontend-only**. The landing page (`/`) is fully static
and works standalone. The `/ops`, `/finance`, and `/flow` dashboards call the API
at `NEXT_PUBLIC_API_BASE_URL` (default `http://localhost:4000`); on the live Pages
site they will show a "failed to fetch" toast until an API is hosted somewhere and
that URL is set at build time.

## Pipeline (no GitHub Actions)

We deploy from the command line to a `gh-pages` branch — GitHub Pages publishes that
branch directly, with **no Actions minutes consumed**.

```bash
pnpm deploy          # builds the static export and force-pushes it to gh-pages
```

Under the hood (`scripts/deploy-web.sh`):
1. `NEXT_PUBLIC_BASE_PATH=/probooking next build` → static export in `apps/web/out`
   (the base path is required because the site is served under `/probooking/`).
2. `touch out/.nojekyll` so Pages serves the `_next/` folder verbatim.
3. Force-push `out/` to the `gh-pages` branch of `origin`.

Local dev and the Playwright e2e leave `NEXT_PUBLIC_BASE_PATH` unset, so they serve
at the root and are unaffected by the base-path config.

## One-time setup

```bash
# 1. Create the public repo and push the code
gh repo create tian-chaiyaporn2/probooking --public --source=. --remote=origin --push

# 2. Publish the first build
pnpm deploy

# 3. Point Pages at the gh-pages branch (Settings → Pages, or:)
gh api --method POST repos/tian-chaiyaporn2/probooking/pages \
  --input - <<< '{"source":{"branch":"gh-pages","path":"/"}}'
```

Live URL: **https://tian-chaiyaporn2.github.io/probooking/**

## Hosting the backend later

To make the dashboards work live, host `apps/api` + Postgres on any Node host, then
rebuild the frontend with the API URL:

```bash
NEXT_PUBLIC_API_BASE_URL=https://your-api.example.com pnpm deploy
```

Remember to set that API's `CORS_ORIGINS=https://tian-chaiyaporn2.github.io` and a
real `JWT_SECRET` (the API refuses to boot in production without one).
