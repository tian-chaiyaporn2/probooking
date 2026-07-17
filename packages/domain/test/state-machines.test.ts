import { describe, it, expect } from "vitest";
import { advanceOffer } from "../src/state-machines/offer.js";
import { advanceBooking } from "../src/state-machines/booking.js";
import { advancePayout } from "../src/state-machines/payment.js";
import { advanceVerification } from "../src/state-machines/verification.js";
import { IllegalTransitionError } from "../src/state-machines/transition.js";

describe("state machines (§6.2)", () => {
  it("offer: acceptance goes to AwaitingPayment, not straight to Converted (OFF-04)", () => {
    expect(advanceOffer("PendingResponse", "AwaitingPayment")).toBe("AwaitingPayment");
    expect(() => advanceOffer("PendingResponse", "Converted")).toThrow(IllegalTransitionError);
  });

  it("booking cannot skip from Confirmed straight to ServiceCompleted", () => {
    expect(() => advanceBooking("Confirmed", "ServiceCompleted")).toThrow(IllegalTransitionError);
  });

  it("payout cannot go Paid -> Processing (no double payout, §6.4)", () => {
    expect(() => advancePayout("Paid", "Processing")).toThrow(IllegalTransitionError);
  });

  it("verification: Submitted -> Verified is allowed; Draft -> Verified is not (VER-02)", () => {
    expect(advanceVerification("Submitted", "Verified")).toBe("Verified");
    expect(() => advanceVerification("Draft", "Verified")).toThrow(IllegalTransitionError);
  });
});

describe("booking machine covers the real completion path (§6.2, CMP-01)", () => {
  it("allows Confirmed -> AwaitingCompletion", () => {
    // Nothing writes InProgress, so requiring it made the only real path illegal and both
    // stores bypassed the machine to compensate.
    expect(advanceBooking("Confirmed", "AwaitingCompletion")).toBe("AwaitingCompletion");
  });

  it("still refuses to skip completion entirely", () => {
    expect(() => advanceBooking("Confirmed", "ServiceCompleted")).toThrow(IllegalTransitionError);
    expect(() => advanceBooking("Cancelled", "AwaitingCompletion")).toThrow(IllegalTransitionError);
    expect(() => advanceBooking("Archived", "Confirmed")).toThrow(IllegalTransitionError);
  });
});
