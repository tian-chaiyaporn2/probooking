# ADR 0002 — Module format & build strategy

**Status:** Accepted · **Date:** 2026-07-16 · **Supersedes the open question in ADR 0001**

## Context

The monorepo mixes an ESM world (domain, db, worker, web, BDD — all run via `tsx`
or Next) with NestJS, whose dependency injection needs **emitted decorator metadata**.
Two concrete problems surfaced while wiring the first vertical slice:

1. **Cross-package source compilation.** `tsconfig.base.json` mapped
   `@probook/domain`/`@probook/db` via `paths` into their `src`. Any app importing
   them pulled the domain *source* into its own `tsc` program → `TS6059: not under
   rootDir`. Consuming a workspace package by source path does not scale.
2. **Metadata vs ESM.** `tsx`/`esbuild` do **not** emit `emitDecoratorMetadata`, so
   running Nest under `tsx` breaks constructor injection. But the domain is ESM, and
   on Node 20 a CommonJS module cannot `require()` an ESM-only package.

## Decision

- **Shared packages are built artifacts.** `@probook/domain` and `@probook/db` are
  ESM, compiled to `dist` (JS + `.d.ts`); their `package.json` `exports`/`main`/`types`
  point at `dist`. Consumers resolve them through normal node resolution — **no
  `paths` alias**. Run `pnpm build` (or `pnpm build:api`) before running apps.
- **The API is ESM, compiled by `tsc`** (not `tsx`, not `nest build`'s defaults).
  `tsc` emits decorator metadata *and* ESM output, so Nest DI works and the ESM
  domain imports cleanly. Dev: `tsc --watch` + `node --watch`.
- **Hoisted node_modules** (`.npmrc` `node-linker=hoisted`) so there is a single
  physical copy of each dependency — avoids the pnpm symlink/realpath mismatch that
  made `tsx` load a second `@cucumber/cucumber` instance under ESM.
- **BDD support code is loaded via CLI `--import`** (cucumber's config `import` is
  not reliably honored under ESM + tsx).

## Consequences

- Apps depend on **built** shared packages: `pnpm build:api` (domain → db → api)
  precedes API start and the e2e run; `pnpm build` builds everything in topo order.
- Editor "go to definition" lands on `dist/*.d.ts` after a build (normal for
  built-package monorepos).
- The API dev loop is `tsc -w` + `node --watch` rather than a bundler — simple and
  metadata-correct. If build time grows, revisit with SWC (`nest -b swc`), which also
  emits metadata.

## Alternatives considered

- **Dual-publish domain (ESM+CJS)** to let a CommonJS API `require` it — more build
  complexity than making the API ESM.
- **`@Inject()` tokens everywhere** to avoid needing metadata under `tsx` —
  non-idiomatic Nest and error-prone as modules grow.
