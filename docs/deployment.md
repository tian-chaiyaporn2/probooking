# Deployment & running

## What deploys where

GitHub Pages serves **static files only**. This monorepo splits into:

| Part | Can host on Pages? | Where it goes |
|---|---|---|
| `apps/web` (Next.js frontend) | ✅ yes — static export | GitHub Pages (`gh-pages` branch) |
| `apps/api` (NestJS) | ❌ no — needs a Node server | a real host (Render/Railway/Fly/VM) or a local tunnel |
| `packages/db` (Postgres) | ❌ no — needs a database | a managed Postgres |
| `apps/worker` | ❌ no — long-running process | a worker host / cron |

So the Pages deploy is **frontend-only**. The landing page (`/`) is fully static and
works standalone. The `/ops`, `/finance`, and `/flow` dashboards call the API at
`NEXT_PUBLIC_API_BASE_URL` (default `http://localhost:4000`, baked in at build time);
without a reachable API they show a "failed to fetch" toast.

## Running locally

Prereq: PostgreSQL running locally (matching `DATABASE_URL` in `.env`).

```bash
pnpm install
pnpm --filter @probook/db exec prisma migrate deploy   # apply migrations
pnpm build:api                                          # build domain + db + api

# API on :4000 (reads .env → Prisma/Postgres store)
node apps/api/dist/main.js
# Web on :3000 (Next dev; talks to the API at NEXT_PUBLIC_API_BASE_URL)
pnpm --filter @probook/web dev
# Worker sweeps (optional): auto-accept / reminders
pnpm --filter @probook/worker start        # or: ... sweep:once
```

Then open **http://localhost:3000**. Local browser → `localhost:3000` → `localhost:4000`
is same-origin-family, so the dashboards work fully (no CORS/tunnel needed).

> Note: if you lock `CORS_ORIGINS` to only the Pages origin (see Demo mode), the local
> web UI at `:3000` will be CORS-blocked. Add `http://localhost:3000` to the allowlist
> if you want both.

## Deploy pipeline

**Automatic:** every push to `master` that passes CI (`.github/workflows/ci.yml`) runs a
`deploy-pages` job: it builds the static export and force-publishes `apps/web/out` to the
`gh-pages` branch. GitHub Pages serves that branch. PRs never deploy; you can also
re-trigger via **Actions → CI → Run workflow** on `master`.

**Manual** (local, or when you need a one-off with a custom `NEXT_PUBLIC_API_BASE_URL`):

```bash
pnpm run deploy:pages          # builds the static export and force-pushes it to gh-pages
```

Under the hood (`scripts/deploy-web.sh`, and the same steps in CI):
1. `NEXT_PUBLIC_BASE_PATH=/probooking next build` → static export in `apps/web/out`
   (the base path is required because the site is served under `/probooking/`).
2. `touch out/.nojekyll` so Pages serves the `_next/` folder verbatim.
3. Force-publish `out/` to the `gh-pages` branch of `origin`.

Local dev and the Playwright e2e leave `NEXT_PUBLIC_BASE_PATH` unset, so they serve at
the root and are unaffected by the base-path config.

### One-time setup (already done for this repo)

```bash
gh repo create tian-chaiyaporn2/probooking --public --source=. --remote=origin --push
pnpm run deploy:pages
gh api --method POST repos/tian-chaiyaporn2/probooking/pages \
  --input - <<< '{"source":{"branch":"gh-pages","path":"/"}}'
```

Live URL: **https://tian-chaiyaporn2.github.io/probooking/**

## Demo mode — public site against your LOCAL API (tunnel)

For semi-private testing (a few people) without hosting the backend, expose the local
API over a public HTTPS tunnel and point the Pages frontend at it. **One command:**

```bash
# with the local API (:4000) + Postgres already running:
bash scripts/tunnel-deploy.sh
```

It opens a `localhost.run` SSH tunnel, grabs the fresh `https://<id>.lhr.life` URL,
rebuilds + redeploys the frontend with `NEXT_PUBLIC_API_BASE_URL` set to it, and holds
the tunnel open. Keep that terminal running for the life of the demo.

**Why a tunnel is required:** browsers block a *public* HTTPS page (github.io) from
fetching a *loopback* address (`http://localhost`) via Private/Local Network Access —
even with perfect CORS. A public HTTPS tunnel side-steps that (public → public).
(In this environment `cloudflared` and `ngrok` didn't route / needed an account;
`localhost.run` worked over SSH.)

**Lock CORS to the Pages origin** (required for a shared demo): set in `.env`

```
CORS_ORIGINS=https://tian-chaiyaporn2.github.io
```

The API then rejects any other *browser* origin, and refuses to boot without an allowlist
unless `AUTH_DEV_MODE=true`. Restart the API after changing it.

> If you also run the local web UI or the e2e suite, add `http://localhost:3000` to the
> list — a Pages-only allowlist blocks every call from localhost, and the failure looks
> like a broken app rather than a CORS rejection.

**CORS is not a security control here.** It is enforced by browsers and means nothing to
`curl`. The tunnel must therefore be pointed at an API that is *itself* safe to expose:
`AUTH_DEV_MODE` off (so `/auth/dev/token` 404s and OTP codes are not returned) and a strong
`JWT_SECRET`. `scripts/tunnel-deploy.sh` probes the running API and refuses to publish it
otherwise, rather than trusting that it was configured correctly.

### Operational caveats
- The tunnel URL is **ephemeral** — every tunnel restart is a new URL. Re-run
  `scripts/tunnel-deploy.sh` (it redeploys automatically). Manual equivalent:
  `NEXT_PUBLIC_API_BASE_URL=https://<id>.lhr.life pnpm run deploy:pages`.
- **Restarting the API breaks the `localhost.run` forward** → restart the tunnel too
  (i.e. just re-run `scripts/tunnel-deploy.sh`), which mints a new URL + redeploys.
- The laptop, Postgres, API, and tunnel must all stay up; if any drops, the dashboards
  stop (the landing page still works).
- It **exposes the demo API publicly** — against your real local Postgres. Anyone with the
  URL can call it directly; CORS does not stop non-browser clients. The script's preflight
  now blocks the worst case (a dev-mode API with an open token endpoint, which would hand
  any caller an administrator session), but every endpoint's own authz is what protects the
  data. Share the Pages link privately, and prefer a hosted API for anything real.

## Hosting the backend properly (durable, no laptop)

For a stable demo that doesn't depend on your machine, host `apps/api` + Postgres on a
Node host (Render/Railway/Fly/VM), then:

```bash
NEXT_PUBLIC_API_BASE_URL=https://your-api.example.com pnpm run deploy:pages
```

On that host set `CORS_ORIGINS=https://tian-chaiyaporn2.github.io` and a real
`JWT_SECRET` (the API refuses to boot in production without one — see `apps/api/main.ts`).
