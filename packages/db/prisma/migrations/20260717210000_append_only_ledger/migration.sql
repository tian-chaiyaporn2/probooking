-- Make "immutable" a control rather than a comment.
--
-- AuditRecord and FinancialEvent are documented as immutable append-only records (§6.4,
-- PAY-05), but nothing stopped an UPDATE or DELETE: the application's DB role has full DML,
-- so any future careless code path — or anything that reaches the database — could rewrite
-- financial history or erase the trail of who did what.
--
-- A rejecting trigger is used rather than REVOKE because it holds regardless of which role
-- connects (including the owner, and including a superuser), and it travels with the schema
-- instead of living in someone's provisioning script. REVOKE UPDATE/DELETE on these tables
-- from the app role is still worth doing in production as a second layer.

CREATE OR REPLACE FUNCTION probook_reject_mutation() RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION '% is append-only (%): % is not permitted',
    TG_TABLE_NAME, TG_ARGV[0], TG_OP
    USING HINT = 'Correct a mistaken entry by appending a compensating record, never by editing history.';
END;
$$ LANGUAGE plpgsql;

-- Audit trail (§6.4): who did what, when. Editable audit is not audit.
CREATE TRIGGER "AuditRecord_append_only"
  BEFORE UPDATE OR DELETE ON "AuditRecord"
  FOR EACH ROW EXECUTE FUNCTION probook_reject_mutation('§6.4');

-- Money ledger (PAY-05): every collection/refund/payout/reversal/adjustment is immutable.
-- Reconciliation (PAY-11) is only meaningful if the events it sums cannot be rewritten.
CREATE TRIGGER "FinancialEvent_append_only"
  BEFORE UPDATE OR DELETE ON "FinancialEvent"
  FOR EACH ROW EXECUTE FUNCTION probook_reject_mutation('PAY-05');

-- AttendanceEvent is evidence for CAN-03 (arrival decides a 100% payout), so it is
-- append-only for the same reason: it must not be editable after a dispute starts.
CREATE TRIGGER "AttendanceEvent_append_only"
  BEFORE UPDATE OR DELETE ON "AttendanceEvent"
  FOR EACH ROW EXECUTE FUNCTION probook_reject_mutation('CAN-03');
