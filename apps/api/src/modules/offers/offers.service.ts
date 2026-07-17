import { Injectable } from "@nestjs/common";
import {
  effectiveOfferExpiry,
  OFFER_TIMERS,
  type ShiftUrgency,
} from "@probook/domain";

/**
 * Offer service (OFF-01..04). Demonstrates how the API composes the pure domain:
 * authority check (OFF-01), one-active-offer + snapshot (OFF-02), timer (OFF-03),
 * and acceptance -> soft hold, not a booking (OFF-04). Marketplace persistence and
 * payment orchestration live in MarketplaceController / MarketplaceRepository.
 *
 * OFF-01 authority is enforced by `requireClinicAuthority` in the controller (membership
 * graph), not a role passed into this service.
 */
@Injectable()
export class OffersService {
  /** OFF-03: compute effective expiry (never past shift start). */
  computeExpiry(sentAt: number, shiftStart: number, urgency: ShiftUrgency): number {
    return effectiveOfferExpiry(sentAt, shiftStart, urgency);
  }

  /**
   * OFF-03/04: acceptance opens the 30-min funding window. The offer's actual
   * PendingResponse -> AwaitingPayment transition is enforced by the caller against
   * the real offer state (advanceOffer); this only computes the funding deadline.
   */
  fundingWindow(acceptedAt: number): { fundingDueAt: number } {
    return { fundingDueAt: acceptedAt + OFFER_TIMERS.fundingWindow };
  }
}
