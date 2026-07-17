import { Injectable } from "@nestjs/common";
import {
  effectiveOfferExpiry,
  effectiveFundingExpiry,
  can,
  type Role,
  type ShiftUrgency,
} from "@probook/domain";

/**
 * Offer service (OFF-01..04). Demonstrates how the API composes the pure domain:
 * authority check (OFF-01), one-active-offer + snapshot (OFF-02), timer (OFF-03),
 * and acceptance -> soft hold, not a booking (OFF-04). Marketplace persistence and
 * payment orchestration live in MarketplaceController / MarketplaceRepository.
 */
@Injectable()
export class OffersService {
  /** OFF-01: only clinic owner/admin may send a binding offer. */
  assertCanSendOffer(role: Role): void {
    if (!can(role, "clinic.send_offer")) {
      throw new Error("FORBIDDEN: only a clinic owner/admin may send a binding offer (OFF-01)");
    }
  }

  /** OFF-03: compute effective expiry (never past shift start). */
  computeExpiry(sentAt: number, shiftStart: number, urgency: ShiftUrgency): number {
    return effectiveOfferExpiry(sentAt, shiftStart, urgency);
  }

  /**
   * OFF-03/04: acceptance opens the 30-min funding window (capped by shift start).
   * The offer's actual PendingResponse -> AwaitingPayment transition is enforced by
   * the caller against the real offer state (advanceOffer); this only computes the deadline.
   */
  fundingWindow(acceptedAt: number, shiftStart: number): { fundingDueAt: number } {
    return { fundingDueAt: effectiveFundingExpiry(acceptedAt, shiftStart) };
  }
}
