-- Integrity constraints: referential integrity + value invariants that were previously
-- enforced only in application code (review §7.3 hardening).

-- Invitation: one per professional per shift, and a real FK to the professional (parity
-- with Application).
CREATE UNIQUE INDEX "InsuranceEvidence_professionalId_key" ON "InsuranceEvidence"("professionalId");
CREATE UNIQUE INDEX "Invitation_shiftId_professionalId_key" ON "Invitation"("shiftId", "professionalId");
ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_professionalId_fkey" FOREIGN KEY ("professionalId") REFERENCES "ProfessionalProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Value invariants (PAY-06/07, SHF-01, REV-02). Money never goes negative; a shift ends
-- after it starts; a review score is 1..5.
ALTER TABLE "Shift" ADD CONSTRAINT "Shift_compensation_positive" CHECK ("compensation" > 0);
ALTER TABLE "Shift" ADD CONSTRAINT "Shift_time_order" CHECK ("endsAt" > "startsAt");
ALTER TABLE "Availability" ADD CONSTRAINT "Availability_time_order" CHECK ("endsAt" > "startsAt");
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_fee_nonneg" CHECK ("feeSnapshot" >= 0);
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_tax_nonneg" CHECK ("taxSnapshot" >= 0);
ALTER TABLE "PaymentOrder" ADD CONSTRAINT "PaymentOrder_captured_nonneg" CHECK ("captured" >= 0);
ALTER TABLE "FinancialAllocation" ADD CONSTRAINT "FinancialAllocation_comp_nonneg" CHECK ("compensation" >= 0);
ALTER TABLE "FinancialAllocation" ADD CONSTRAINT "FinancialAllocation_fee_nonneg" CHECK ("serviceFee" >= 0);
ALTER TABLE "FinancialAllocation" ADD CONSTRAINT "FinancialAllocation_tax_nonneg" CHECK ("tax" >= 0);
ALTER TABLE "Review" ADD CONSTRAINT "Review_score_range" CHECK ("score" BETWEEN 1 AND 5);
