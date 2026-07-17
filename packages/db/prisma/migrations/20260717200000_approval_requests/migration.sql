-- §6.4 different-person approval for high-value money actions (payment exceptions).
--
-- The rule existed only as a domain predicate with no caller: `dualControlSatisfied` was
-- referenced by a BDD step and nothing else, so a payout or refund needed exactly one pair
-- of hands. Enforcing "two different authorized people" needs persisted state — one request
-- cannot carry two actors — hence this table.

CREATE TYPE "ApprovalState" AS ENUM ('Pending', 'Executed', 'Rejected');

CREATE TABLE "ApprovalRequest" (
    "id" TEXT NOT NULL,
    "capability" TEXT NOT NULL,
    "refType" TEXT NOT NULL,
    "refId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "state" "ApprovalState" NOT NULL DEFAULT 'Pending',
    "initiatorId" TEXT NOT NULL,
    "initiatorRole" TEXT NOT NULL,
    "executorId" TEXT,
    "executorRole" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" TIMESTAMPTZ(3),

    CONSTRAINT "ApprovalRequest_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ApprovalRequest_state_createdAt_idx" ON "ApprovalRequest"("state", "createdAt");
CREATE INDEX "ApprovalRequest_refType_refId_idx" ON "ApprovalRequest"("refType", "refId");

-- Money never goes backwards, and an executed request must record who executed it. The
-- second constraint is what makes "a different person approved this" auditable after the
-- fact rather than merely checked in flight.
ALTER TABLE "ApprovalRequest" ADD CONSTRAINT "ApprovalRequest_amount_positive" CHECK ("amount" > 0);
ALTER TABLE "ApprovalRequest" ADD CONSTRAINT "ApprovalRequest_executed_has_executor"
  CHECK ("state" <> 'Executed' OR ("executorId" IS NOT NULL AND "decidedAt" IS NOT NULL));

-- The core §6.4 invariant, at the database: an executed request's executor is never its
-- initiator. A check in application code alone would leave the table able to hold a row
-- that contradicts the rule it exists to enforce.
ALTER TABLE "ApprovalRequest" ADD CONSTRAINT "ApprovalRequest_different_person"
  CHECK ("executorId" IS NULL OR "executorId" <> "initiatorId");
