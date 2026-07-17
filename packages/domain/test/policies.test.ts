import { describe, it, expect } from "vitest";
import { satang } from "../src/money.js";
import {
  cancellationOutcome,
  payableFromFraction,
  effectiveOfferExpiry,
  effectiveFundingExpiry,
  isExpired,
  autoAcceptDueAt,
  completionReviewDueAt,
  isUrgentEligible,
  URGENT_WINDOW,
  AUTO_ACCEPT_AFTER,
  CLINIC_COMPLETION_REVIEW_AFTER,
  OFFER_TIMERS,
} from "../src/policies.js";

describe("cancellation policy (CAN-01..05)", () => {
  it("clinic cancels >= 24h before start -> 0% (CAN-01)", () => {
    expect(
      cancellationOutcome({ actor: "clinic", reason: "ordinary", hoursBeforeStart: 30, arrived: false }),
    ).toEqual({ fraction: 0 });
  });

  it("clinic cancels < 24h before start -> 50% (CAN-02)", () => {
    expect(
      cancellationOutcome({ actor: "clinic", reason: "ordinary", hoursBeforeStart: 5, arrived: false }),
    ).toEqual({ fraction: 0.5 });
  });

  it("clinic unavailable after arrival -> 100% (CAN-03)", () => {
    expect(
      cancellationOutcome({
        actor: "clinic",
        reason: "clinic_unavailable_after_arrival",
        hoursBeforeStart: 0,
        arrived: true,
      }),
    ).toEqual({ fraction: 1 });
  });

  it("professional no-show -> 0% (CAN-04)", () => {
    expect(
      cancellationOutcome({ actor: "professional", reason: "ordinary", hoursBeforeStart: 2, arrived: false }),
    ).toEqual({ fraction: 0 });
  });

  it("force majeure / partial work -> support (CAN-05)", () => {
    expect(
      cancellationOutcome({ actor: "clinic", reason: "partial_work", hoursBeforeStart: 1, arrived: true }),
    ).toEqual({ support: true });
  });

  // Every CAN-05 reason routes to support regardless of actor/timing. Table-driven so a
  // reason dropped from the disjunction fails here instead of silently auto-paying.
  it.each(["force_majeure", "safety", "credential", "platform_or_provider_failure", "partial_work"] as const)(
    "%s always routes to support, never a fraction (CAN-05)",
    (reason) => {
      for (const actor of ["clinic", "professional"] as const) {
        for (const hoursBeforeStart of [48, 1, -2]) {
          expect(cancellationOutcome({ actor, reason, hoursBeforeStart, arrived: false })).toEqual({
            support: true,
          });
        }
      }
    },
  );

  it("the CAN-01 boundary is inclusive: exactly 24h -> 0%, just under -> 50%", () => {
    expect(
      cancellationOutcome({ actor: "clinic", reason: "ordinary", hoursBeforeStart: 24, arrived: false }),
    ).toEqual({ fraction: 0 });
    expect(
      cancellationOutcome({ actor: "clinic", reason: "ordinary", hoursBeforeStart: 23.999, arrived: false }),
    ).toEqual({ fraction: 0.5 });
  });

  it("arrival before the scheduled start still earns 100% (CAN-03)", () => {
    // A professional who arrives early and is turned away has travelled and lost the slot;
    // paying 50% because the clock had not struck the start time underpays them.
    expect(
      cancellationOutcome({
        actor: "clinic",
        reason: "ordinary",
        hoursBeforeStart: 0.5,
        arrived: true,
      }),
    ).toEqual({ fraction: 1 });
  });

  it("an unsubstantiated after-arrival claim does not pay 100% (CAN-03)", () => {
    // reason says "after arrival" but no arrival was recorded -> ordinary timing rules.
    expect(
      cancellationOutcome({
        actor: "clinic",
        reason: "clinic_unavailable_after_arrival",
        hoursBeforeStart: 5,
        arrived: false,
      }),
    ).toEqual({ fraction: 0.5 });
    expect(
      cancellationOutcome({
        actor: "clinic",
        reason: "clinic_unavailable_after_arrival",
        hoursBeforeStart: 48,
        arrived: false,
      }),
    ).toEqual({ fraction: 0 });
  });

  it("a professional cancellation is 0% even after arrival (CAN-04 beats CAN-03)", () => {
    expect(
      cancellationOutcome({ actor: "professional", reason: "ordinary", hoursBeforeStart: 0, arrived: true }),
    ).toEqual({ fraction: 0 });
  });

  it("rejects non-finite hoursBeforeStart", () => {
    expect(() =>
      cancellationOutcome({ actor: "clinic", reason: "ordinary", hoursBeforeStart: Number.NaN, arrived: false }),
    ).toThrow(RangeError);
  });
});

describe("offer expiry (OFF-03)", () => {
  it("standard offer never outlives shift start", () => {
    const sentAt = 0;
    const shiftStart = OFFER_TIMERS.standardExpiry - 1; // shift starts before 12h timer
    expect(effectiveOfferExpiry(sentAt, shiftStart, "standard")).toBe(shiftStart);
  });

  it("urgent offer uses the 2h timer when it lands before shift start", () => {
    const sentAt = 0;
    const shiftStart = 100 * 60 * 60 * 1000; // far away
    expect(effectiveOfferExpiry(sentAt, shiftStart, "urgent")).toBe(OFFER_TIMERS.urgentExpiry);
  });

  it("funding window is capped by shift start", () => {
    const acceptedAt = 0;
    const shiftStart = OFFER_TIMERS.fundingWindow / 2;
    expect(effectiveFundingExpiry(acceptedAt, shiftStart)).toBe(shiftStart);
    expect(effectiveFundingExpiry(acceptedAt, 100 * 60 * 60 * 1000)).toBe(OFFER_TIMERS.fundingWindow);
  });

  it("isExpired is inclusive of the deadline instant", () => {
    expect(isExpired(100, 100)).toBe(true);
    expect(isExpired(99, 100)).toBe(false);
  });
});

describe("auto-accept due time (CMP-03)", () => {
  it("measures 24h from submission when it is later than scheduled end", () => {
    const scheduledEnd = 1000;
    const submittedAt = 5000;
    expect(autoAcceptDueAt(scheduledEnd, submittedAt)).toBe(5000 + AUTO_ACCEPT_AFTER);
  });

  it("measures 24h from scheduled end when it is later than submission", () => {
    const scheduledEnd = 9000;
    const submittedAt = 5000;
    expect(autoAcceptDueAt(scheduledEnd, submittedAt)).toBe(9000 + AUTO_ACCEPT_AFTER);
  });
});

describe("clinic completion review due time (CMP-04)", () => {
  it("is 48h after the scheduled shift end", () => {
    expect(completionReviewDueAt(10_000)).toBe(10_000 + CLINIC_COMPLETION_REVIEW_AFTER);
  });
});

describe("urgent eligibility (URG-01)", () => {
  it("is eligible when the shift starts within 72h", () => {
    expect(isUrgentEligible(URGENT_WINDOW - 1, 0)).toBe(true);
  });
  it("is not eligible beyond 72h or in the past", () => {
    expect(isUrgentEligible(URGENT_WINDOW + 1, 0)).toBe(false);
    expect(isUrgentEligible(-1, 0)).toBe(false);
  });
});

describe("payableFromFraction guards (CAN-*)", () => {
  it("rejects a negative compensation or an out-of-range fraction", () => {
    expect(() => payableFromFraction(satang(-1), 0.5)).toThrow(RangeError);
    expect(() => payableFromFraction(satang(100), 1.5)).toThrow(RangeError);
    expect(() => payableFromFraction(satang(100), -0.5)).toThrow(RangeError);
  });

  it("rounds half-up, pinning the 1-satang tie-break direction", () => {
    // This is the rounding step for every cancellation payout; the direction must not drift.
    expect(payableFromFraction(satang(125_055), 0.5)).toBe(62_528); // 62,527.5 -> up
    expect(payableFromFraction(satang(125_053), 0.5)).toBe(62_527); // 62,526.5 -> up
    expect(payableFromFraction(satang(100), 1)).toBe(100);
    expect(payableFromFraction(satang(100), 0)).toBe(0);
  });
});
