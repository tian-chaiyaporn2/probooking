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
    const fin1 = { id: "u1", role: "finance" } as const;
    const fin2 = { id: "u2", role: "finance" } as const;
    expect(dualControlSatisfied("finance.execute_payout", fin1, fin1)).toBe(false);
    expect(dualControlSatisfied("finance.execute_payout", fin1, fin2)).toBe(true);
    // A non-dual-control capability is satisfiable by a single actor.
    expect(dualControlSatisfied("pro.apply", { id: "u1", role: "professional" }, { id: "u1", role: "professional" })).toBe(true);
  });

  it("dual-control requires the second person to be AUTHORIZED, not merely different (§6.4)", () => {
    // The check used to compare ids only, so any second pair of hands satisfied a payout
    // approval — including someone with no finance authority at all.
    const finance = { id: "u1", role: "finance" } as const;
    const clinic = { id: "u2", role: "clinic_owner" } as const;
    expect(dualControlSatisfied("finance.execute_payout", finance, clinic)).toBe(false);
    // ...and the initiator must have been authorized too, or "two people" is theatre.
    expect(dualControlSatisfied("finance.execute_payout", clinic, finance)).toBe(false);
  });

  it("a non-dual-control capability still requires the executor to hold it", () => {
    // pro.apply is single-actor, but a clinic owner still cannot apply as a professional.
    expect(
      dualControlSatisfied("pro.apply", { id: "u1", role: "clinic_owner" }, { id: "u1", role: "clinic_owner" }),
    ).toBe(false);
  });
});
