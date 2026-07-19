-- OFF-02: PaymentFailed still blocks the one active offer slot for a shift.
--
-- An accepted offer whose capture failed must not let the clinic send a second binding
-- offer while the funding/retry window is still open. Treat PaymentFailed as active in the
-- database invariant, and repair existing duplicates first so the index can be created.

UPDATE "Offer" o
SET "state" = 'Withdrawn'
WHERE o."state" IN ('PendingResponse', 'AwaitingPayment', 'PaymentFailed')
  AND o."id" <> (
    SELECT k."id" FROM "Offer" k
    WHERE k."shiftId" = o."shiftId"
      AND k."state" IN ('PendingResponse', 'AwaitingPayment', 'PaymentFailed')
    ORDER BY k."sentAt" ASC, k."id" ASC
    LIMIT 1
  );

DROP INDEX IF EXISTS "Offer_one_active_per_shift";

CREATE UNIQUE INDEX "Offer_one_active_per_shift"
  ON "Offer"("shiftId")
  WHERE "state" IN ('PendingResponse', 'AwaitingPayment', 'PaymentFailed');
