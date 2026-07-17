import { describe, it, expect } from "vitest";
import { advanceOffer, type OfferState } from "@probook/domain";

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
