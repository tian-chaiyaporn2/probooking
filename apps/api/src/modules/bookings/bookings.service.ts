import { Injectable } from "@nestjs/common";
import {
  checkConfirmationEligibility,
  type ConfirmationContext,
  advanceOffer,
} from "@probook/domain";

/**
 * Booking confirmation (BKG-01/02). Confirmation is ATOMIC and idempotent: the
 * real implementation wraps eligibility + prefunding capture + booking insert in a
 * single transaction with a unique constraint on shiftId so one shift can never
 * produce two bookings (§6.4). Here we express the decision gate.
 */
@Injectable()
export class BookingsService {
  confirm(ctx: ConfirmationContext): { confirmed: true } {
    const result = checkConfirmationEligibility(ctx);
    if (!result.eligible) {
      throw new Error(`NOT_ELIGIBLE: ${result.failures.join(", ")}`);
    }
    // Offer AwaitingPayment -> Converted once durable prefunding has succeeded.
    advanceOffer("AwaitingPayment", "Converted");
    return { confirmed: true };
  }
}
