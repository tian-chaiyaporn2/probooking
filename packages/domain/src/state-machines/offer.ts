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
  // A declined card inside the 30-minute funding window (OFF-03) must be retryable — a
  // transient failure is not a decision. This was a dead end, justified by §6.3's "a late
  // payment after expiry never books"; but that rule is about EXPIRY, and it is enforced by
  // `offerExpired` in checkConfirmationEligibility, not by making one decline terminal.
  PaymentFailed: ["AwaitingPayment", "Expired", "Withdrawn"],
  Converted: [],
  Declined: [],
  Withdrawn: [],
  Expired: [],
};

export const advanceOffer = (from: OfferState, to: OfferState): OfferState =>
  assertTransition("offer", OFFER_TRANSITIONS, from, to);
