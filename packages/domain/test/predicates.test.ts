import { describe, it, expect } from "vitest";
import {
  canLeaveReview,
  countsTowardPublicReputation,
  withinAllocation,
  dualControlSatisfied,
  satang,
} from "../src/index.js";

describe("review + reputation predicates", () => {
  it("only a completed booking confers review rights (REV-01/05)", () => {
    expect(canLeaveReview("ServiceCompleted")).toBe(true);
    expect(canLeaveReview("Cancelled")).toBe(false);
    expect(canLeaveReview("Confirmed")).toBe(false);
  });

  it("related-party bookings create no public reputation (REV-05)", () => {
    expect(countsTowardPublicReputation(false)).toBe(true);
    expect(countsTowardPublicReputation(true)).toBe(false);
  });
});

describe("money + dual-control predicates", () => {
  it("payout within allocation (PAY-08)", () => {
    expect(withinAllocation(satang(500_000), satang(500_000))).toBe(true);
    expect(withinAllocation(satang(600_000), satang(500_000))).toBe(false);
    expect(withinAllocation(satang(-1 as number), satang(500_000))).toBe(false);
  });

  it("dual-control requires a different second approver (§6.4)", () => {
    expect(dualControlSatisfied("finance.execute_payout", "u1", "u1")).toBe(false);
    expect(dualControlSatisfied("finance.execute_payout", "u1", "u2")).toBe(true);
    // A non-dual-control capability is satisfiable by a single actor.
    expect(dualControlSatisfied("pro.apply", "u1", "u1")).toBe(true);
  });
});
