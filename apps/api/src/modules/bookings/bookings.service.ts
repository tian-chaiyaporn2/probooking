import { Injectable } from "@nestjs/common";
import {
  checkConfirmationEligibility,
  type ConfirmationContext,
} from "@probook/domain";

/**
 * Booking confirmation gate (BKG-01/02). Confirmation is ATOMIC and idempotent: the
 * real implementation wraps eligibility + prefunding capture + booking insert in a
 * single transaction with a unique constraint on shiftId so one shift can never
 * produce two bookings (§6.4). This service owns the pure eligibility decision;
 * the caller owns the offer-state transition against the actual offer record.
 */
@Injectable()
export class BookingsService {
  /** Throws NOT_ELIGIBLE (with the precise failing checks) unless every §6.3 gate passes. */
  assertEligible(ctx: ConfirmationContext): void {
    const result = checkConfirmationEligibility(ctx);
    if (!result.eligible) {
      throw new Error(`NOT_ELIGIBLE: ${result.failures.join(", ")}`);
    }
  }
}
