-- Concurrency invariants: rules that were enforced only by application-code reads, which
-- cannot hold under concurrent requests (check-then-act races), plus the indexes the
-- worker sweeps and hot-path lookups need.
--
-- Every constraint here repairs existing data FIRST. A migration that assumes a clean
-- table is a deploy that fails on the one database that matters.

-- ---------------------------------------------------------------------------
-- OFF-02: at most one ACTIVE (non-terminal) offer per shift.
--
-- schema.prisma promised "a partial unique index (add via migration)" — it was never
-- written, so this rule lived only in the in-memory store used by tests. Postgres had no
-- opinion, and two concurrent sends both passed the service-layer read.
--
-- Repair: where a shift already has several active offers, keep the earliest and withdraw
-- the rest (OFF-01 is a single binding offer; the later ones should never have existed).
UPDATE "Offer" o
SET "state" = 'Withdrawn'
WHERE o."state" IN ('PendingResponse', 'AwaitingPayment')
  AND o."id" <> (
    SELECT k."id" FROM "Offer" k
    WHERE k."shiftId" = o."shiftId"
      AND k."state" IN ('PendingResponse', 'AwaitingPayment')
    ORDER BY k."sentAt" ASC, k."id" ASC
    LIMIT 1
  );

-- Partial unique indexes are not expressible in the Prisma schema, so this lives in SQL.
-- Do not remove it to satisfy `prisma migrate dev` drift detection — see schema.prisma.
CREATE UNIQUE INDEX "Offer_one_active_per_shift"
  ON "Offer"("shiftId")
  WHERE "state" IN ('PendingResponse', 'AwaitingPayment');

-- ---------------------------------------------------------------------------
-- One support case per (booking, kind): the port documents this ("one per (booking,
-- kind)") and both flag-inactive and hold-credential check-then-create. Concurrent
-- workers produced duplicate Ops cases for one booking.
DELETE FROM "SupportCase" a
USING "SupportCase" b
WHERE a."refType" IS NOT NULL AND a."refId" IS NOT NULL
  AND a."refType" = b."refType" AND a."refId" = b."refId" AND a."kind" = b."kind"
  AND (a."createdAt" > b."createdAt" OR (a."createdAt" = b."createdAt" AND a."id" > b."id"));

CREATE UNIQUE INDEX "SupportCase_ref_kind_key"
  ON "SupportCase"("refType", "refId", "kind")
  WHERE "refType" IS NOT NULL AND "refId" IS NOT NULL;

-- ---------------------------------------------------------------------------
-- NOT-01 reminders are sent at most once per booking per window. Scoped to reminder
-- events only: other events (e.g. "confirmed") are legitimately sent to both parties
-- across two channels and must stay duplicable.
DELETE FROM "Notification" a
USING "Notification" b
WHERE a."event" IN ('reminder_24h', 'reminder_3h')
  AND a."event" = b."event" AND a."refId" = b."refId" AND a."refId" IS NOT NULL
  AND (a."createdAt" > b."createdAt" OR (a."createdAt" = b."createdAt" AND a."id" > b."id"));

CREATE UNIQUE INDEX "Notification_reminder_once"
  ON "Notification"("event", "refId")
  WHERE "event" IN ('reminder_24h', 'reminder_3h') AND "refId" IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Indexes for queries that currently sequential-scan.

-- The auto-accept sweep runs every 60s and filters exactly these columns.
CREATE INDEX "Booking_autoAccept_sweep"
  ON "Booking"("state", "autoAcceptAt")
  WHERE "heldAt" IS NULL;

-- Postgres does not auto-index foreign keys. hasScheduleOverlap is on the confirm hot path.
CREATE INDEX "Booking_professionalId_idx" ON "Booking"("professionalId");
CREATE INDEX "Shift_workspaceId_idx" ON "Shift"("workspaceId");
CREATE INDEX "Offer_professionalId_idx" ON "Offer"("professionalId");
CREATE INDEX "Credential_professionalId_idx" ON "Credential"("professionalId");
CREATE INDEX "SupportCase_ref_idx" ON "SupportCase"("refType", "refId");
CREATE INDEX "Review_subject_published_idx" ON "Review"("subjectId", "publishedAt");
