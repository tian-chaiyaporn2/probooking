# apps/ops — Internal tools (Operations / Finance / Admin)

Per PRD **ADM-02**, low-code internal tools are allowed, but **privileged changes must
call controlled backend actions** — they must never write financial truth or provider
state directly (PAY-06).

## Approach

This surface is intentionally thin. Options, in order of preference for Phase 0/1:

1. **Low-code admin** (e.g. Retool / Appsmith / Forest Admin) pointed at the
   `@probook/api` controlled endpoints. Fastest for Operations/Finance queues.
2. A small protected Next.js admin area if custom UX is needed.

> **Status (Phase 1): option 2 is implemented** in
> [`apps/web/src/app/ops`](../web/src/app/ops) and
> [`apps/web/src/app/finance`](../web/src/app/finance) — role-guarded dashboards that
> call the controlled `/ops/*` and `/finance/*` API actions (verify, hold/resolve,
> reconciliation, export, metrics, audit). This package remains a design note; there is
> no separate `apps/ops` build.

Whatever the tool, it authenticates internal users with **MFA** (§3), enforces
**least privilege**, and every privileged change is **audited** (§6.4). High-value or
unusual money actions require a **second authorized person** (dual control —
see `requiresDualControl` in `@probook/domain`).

## Queues this surface must serve (§8.2)

- **Operations:** verification, matching help, ordinary cases, cancellations, reviews, suspensions.
- **Finance:** daily reconciliation, payouts, refunds, payment exceptions, financial documents.
- **Administrator:** permissions, high-risk cases, configuration, exceptional approvals.
