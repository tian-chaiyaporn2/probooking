# BDD features

These `.feature` files are the executable acceptance spec. They map 1:1 to the
**14 BDD coverage areas** in PRD §9.4 and are the artifact called for by Rollout
Plan Immediate Action #1 ("Convert Phase 0 and Phase 1 PRD requirements into BDD").

| # | Area (§9.4) | File |
|---|---|---|
| 1 | Verification & restricted browsing | `01-verification-and-restricted-browsing.feature` |
| 2 | Availability, Open to requests, conflict prevention | `02-availability-and-conflicts.feature` |
| 3 | Search, empty results, applications, invitations | `03-search-applications-invitations.feature` |
| 4 | Clinic authority & one active offer | `04-clinic-authority-and-offers.feature` |
| 5 | Offer expiry, soft hold, payment, atomic confirmation | `05-offer-expiry-and-confirmation.feature` |
| 6 | Late/duplicate callbacks & financial conservation | `06-callbacks-and-conservation.feature` |
| 7 | Urgent priority without guarantee | `07-urgent-priority.feature` |
| 8 | Messaging & patient-data rules | `08-messaging-and-patient-data.feature` |
| 9 | Completion, auto-accept, clinic fallback, Ops queue | `09-completion-and-auto-accept.feature` |
| 10 | Cancellation, no-show, partial work, support | `10-cancellation-and-support.feature` |
| 11 | Payout/refund idempotency & different-person approval | `11-payout-refund-idempotency.feature` |
| 12 | Reviews, cold-start, related-party exclusion | `12-reviews-and-coldstart.feature` |
| 13 | Credential/insurance failure after confirmation | `13-credential-failure-after-confirmation.feature` |
| 14 | Derived customer status & immutable audit | `14-derived-status-and-audit.feature` |

## Running

```bash
pnpm test:bdd            # all features
pnpm test:bdd -- features/05-offer-expiry-and-confirmation.feature
```

Steps live in `features/step-definitions/`. Many steps can exercise `@probook/domain`
directly (pure, no I/O); integration steps drive the API. Tag `@wip` for unimplemented
scenarios so they can be excluded from CI gates.
