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
pnpm run deploy:pages          # builds the static export and force-pushes it to gh-pages
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
pnpm run deploy:pages

# 3. Point Pages at the gh-pages branch (Settings → Pages, or:)
gh api --method POST repos/tian-chaiyaporn2/probooking/pages \
  --input - <<< '{"source":{"branch":"gh-pages","path":"/"}}'
```

Live URL: **https://tian-chaiyaporn2.github.io/probooking/**

## Hosting the backend later

To make the dashboards work live, host `apps/api` + Postgres on any Node host, then
rebuild the frontend with the API URL:

```bash
NEXT_PUBLIC_API_BASE_URL=https://your-api.example.com pnpm run deploy:pages
```

Remember to set that API's `CORS_ORIGINS=https://tian-chaiyaporn2.github.io` and a
real `JWT_SECRET` (the API refuses to boot in production without one).

## Demo mode — public site against your LOCAL API (tunnel)

For semi-private testing (a few people) without hosting the backend, expose the
local API over a public HTTPS tunnel and point the Pages frontend at it.

```bash
# with the local API (:4000) + Postgres already running:
bash scripts/tunnel-deploy.sh
```

It opens a `localhost.run` SSH tunnel (works where cloudflared/ngrok didn't in this
environment), grabs the fresh `https://<id>.lhr.life` URL, rebuilds + redeploys the
frontend with `NEXT_PUBLIC_API_BASE_URL` set to it, and keeps the tunnel alive.

Why a tunnel is required: browsers block a **public** HTTPS page (github.io) from
fetching **loopback** (`http://localhost`) via Private/Local Network Access — even
with correct CORS. A public HTTPS tunnel side-steps that (public → public).

Caveats:
- The tunnel URL is **ephemeral** — every restart is a new URL, so re-run the script
  (it redeploys automatically). The laptop, API, Postgres, and tunnel must stay up.
- It **exposes the demo API publicly**: anyone with the URL can hit `/auth/dev/token`
  and read the demo data. Share the Pages link privately; fine for a throwaway demo.
- Manual equivalent: `NEXT_PUBLIC_API_BASE_URL=https://<id>.lhr.life pnpm run deploy:pages`.
