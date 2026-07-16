import { describe, it, expect } from "vitest";
import { advanceOffer } from "../src/state-machines/offer.js";
import { advanceBooking } from "../src/state-machines/booking.js";
import { advancePayout } from "../src/state-machines/payment.js";
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
});
