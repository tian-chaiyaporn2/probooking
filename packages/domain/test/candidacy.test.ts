import { describe, it, expect } from "vitest";
import {
  advanceApplication,
  advanceInvitation,
  advanceCase,
  advanceRefund,
  advanceVerification,
  IllegalTransitionError,
} from "../src/index.js";

describe("candidacy + case state machines", () => {
  it("allows an application to progress toward a booking", () => {
    expect(advanceApplication("Submitted", "OfferSent")).toBe("OfferSent");
    expect(advanceApplication("OfferSent", "Booked")).toBe("Booked");
  });

  it("rejects illegal application/invitation transitions", () => {
    expect(() => advanceApplication("Booked", "Submitted")).toThrow(IllegalTransitionError);
    expect(() => advanceInvitation("Declined", "Interested")).toThrow(IllegalTransitionError);
  });

  it("lets a case be resolved and reopened, but not resurrected from thin air", () => {
    expect(advanceCase("Open", "Resolved")).toBe("Resolved");
    expect(advanceCase("Resolved", "Reopened")).toBe("Reopened");
    expect(() => advanceCase("Resolved", "Open")).toThrow(IllegalTransitionError);
  });
});

describe("payment/verification transition fixes", () => {
  it("allows successive partial refunds before a full refund (PAY-08 caps the amount)", () => {
    expect(advanceRefund("PartiallyRefunded", "PartiallyRefunded")).toBe("PartiallyRefunded");
    expect(advanceRefund("PartiallyRefunded", "Refunded")).toBe("Refunded");
  });

  it("allows a Verified record to be Rejected directly on fraud discovery (VER-04)", () => {
    expect(advanceVerification("Verified", "Rejected")).toBe("Rejected");
  });
});
