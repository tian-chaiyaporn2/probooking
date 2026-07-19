-- FinancialAllocation amounts are immutable once recorded.
--
-- PAY-05 already makes FinancialEvent append-only; allocation amounts are the booking's
-- protected-money split and must not be rewritten later. State columns may still change as
-- payouts/refunds execute.

CREATE OR REPLACE FUNCTION probook_reject_allocation_amount_update() RETURNS TRIGGER AS $$
BEGIN
  IF NEW."compensation" IS DISTINCT FROM OLD."compensation"
    OR NEW."serviceFee" IS DISTINCT FROM OLD."serviceFee"
    OR NEW."tax" IS DISTINCT FROM OLD."tax" THEN
    RAISE EXCEPTION 'FinancialAllocation amounts are immutable (PAY-05): compensation/serviceFee/tax cannot be updated'
      USING HINT = 'Append FinancialEvent rows and update payoutState/refundState; do not edit the protected allocation.';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "FinancialAllocation_amount_immutable"
  BEFORE UPDATE ON "FinancialAllocation"
  FOR EACH ROW EXECUTE FUNCTION probook_reject_allocation_amount_update();
