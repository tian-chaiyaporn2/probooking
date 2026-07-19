import { describe, it, expect } from "vitest";
import { advanceOffer, type OfferState } from "@probook/domain";
import { isOfferDueForExpiry } from "../src/jobs/expireOffers.js";

/**
 * Offer-expiry job logic (OFF-03): domain transition must allow every active state the
 * sweep selects. The Prisma write lives in the worker; this pins the machine contract the
 * sweep depends on so a machine change cannot silently make the job a no-op.
 */
describe("expireOffersSweep domain contract (OFF-03)", () => {
  const active: OfferState[] = ["PendingResponse", "AwaitingPayment", "PaymentFailed"];

  it("allows Expired from every active offer state the sweep targets", () => {
    for (const from of active) {
      expect(advanceOffer(from, "Expired")).toBe("Expired");
    }
  });

  it("refuses Expired from terminal states (Converted / Declined / Withdrawn / Expired)", () => {
    for (const from of ["Converted", "Declined", "Withdrawn", "Expired"] as OfferState[]) {
      expect(() => advanceOffer(from, "Expired")).toThrow();
    }
  });
});

describe("expireOffersSweep selection predicate (OFF-03)", () => {
  it("keeps accepted offers active until the funding window closes", () => {
    const now = 1_000;

    // Regression guard: AwaitingPayment / PaymentFailed are active OFF-02 offers, but
    // they must not expire merely because the original response deadline (`expiresAt`)
    // passed while payment is still inside its funding window.
    expect(
      isOfferDueForExpiry({
        state: "AwaitingPayment",
        expiresAt: now - 1,
        fundingDueAt: now + 10_000,
        now,
      }),
    ).toBe(false);
    expect(
      isOfferDueForExpiry({
        state: "PaymentFailed",
        expiresAt: now - 1,
        fundingDueAt: now + 10_000,
        now,
      }),
    ).toBe(false);
  });

  it("uses response deadline for PendingResponse and funding deadline after acceptance", () => {
    const now = 1_000;
    expect(
      isOfferDueForExpiry({
        state: "PendingResponse",
        expiresAt: now,
        fundingDueAt: null,
        now,
      }),
    ).toBe(true);
    expect(
      isOfferDueForExpiry({
        state: "AwaitingPayment",
        expiresAt: now - 1,
        fundingDueAt: now,
        now,
      }),
    ).toBe(true);
    expect(
      isOfferDueForExpiry({
        state: "PaymentFailed",
        expiresAt: now - 1,
        fundingDueAt: null,
        now,
      }),
    ).toBe(false);
  });
});
