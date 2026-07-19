import { describe, it, expect } from "vitest";
import { checkConfirmationEligibility, type ConfirmationContext } from "../src/eligibility.js";

const ok: ConfirmationContext = {
  clinicActiveVerified: true,
  professionalActiveVerified: true,
  credentialValidThroughShiftEnd: true,
  insuranceRequired: false,
  insuranceValidThroughShiftEnd: true,
  clinicServiceSupported: true,
  shiftCategorySupported: true,
  hasSuspension: false,
  hasBlockingHold: false,
  hasScheduleOverlap: false,
  offerExpired: false,
  durablePrefundingSucceeded: true,
};

describe("checkConfirmationEligibility (BKG-01 / §6.3)", () => {
  it("passes when every gate is clear", () => {
    expect(checkConfirmationEligibility(ok)).toEqual({ eligible: true });
  });

  it("collects every failed reason, not just the first", () => {
    const result = checkConfirmationEligibility({
      ...ok,
      clinicActiveVerified: false,
      offerExpired: true,
      durablePrefundingSucceeded: false,
    });
    expect(result.eligible).toBe(false);
    if (!result.eligible) {
      expect(result.failures).toEqual(
        expect.arrayContaining(["clinic_not_active_verified", "offer_expired", "prefunding_failed"]),
      );
    }
  });

  it("only requires insurance when the shift says so", () => {
    expect(
      checkConfirmationEligibility({
        ...ok,
        insuranceRequired: false,
        insuranceValidThroughShiftEnd: false,
      }),
    ).toEqual({ eligible: true });
    const bad = checkConfirmationEligibility({
      ...ok,
      insuranceRequired: true,
      insuranceValidThroughShiftEnd: false,
    });
    expect(bad.eligible).toBe(false);
    if (!bad.eligible) expect(bad.failures).toContain("insurance_invalid_through_shift_end");
  });
});
