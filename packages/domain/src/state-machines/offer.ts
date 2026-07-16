/**
 * Offer lifecycle (§6.2). One active offer per shift (OFF-02). Only a clinic
 * owner/admin may send it (OFF-01). Acceptance creates a soft hold, NOT a booking
 * (OFF-04) — the offer moves to AwaitingPayment; confirmation happens elsewhere
 * once durable prefunding succeeds (BKG-01), flipping the offer to Converted.
 */
import type { OfferState } from "../states.js";
import { assertTransition, type TransitionMap } from "./transition.js";

export const OFFER_TRANSITIONS: TransitionMap<OfferState> = {
  PendingResponse: ["AwaitingPayment", "Declined", "Withdrawn", "Expired"],
  AwaitingPayment: ["Converted", "PaymentFailed", "Expired", "Withdrawn"],
  PaymentFailed: ["Expired", "Withdrawn"], // a late/failed payment never books (§6.3)
  Converted: [],
  Declined: [],
  Withdrawn: [],
  Expired: [],
};

export const advanceOffer = (from: OfferState, to: OfferState): OfferState =>
  assertTransition("offer", OFFER_TRANSITIONS, from, to);
