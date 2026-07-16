import { describe, it, expect } from "vitest";
import {
  cancellationOutcome,
  effectiveOfferExpiry,
  autoAcceptDueAt,
  completionReviewDueAt,
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
