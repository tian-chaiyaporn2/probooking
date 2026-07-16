import { Module } from "@nestjs/common";
import { HealthModule } from "./modules/health/health.module.js";
import { OffersModule } from "./modules/offers/offers.module.js";
import { BookingsModule } from "./modules/bookings/bookings.module.js";
import { PaymentsModule } from "./modules/payments/payments.module.js";

/**
 * Bounded contexts (PRD §7.1 data groups). Additional modules to add as scaffold
 * grows: auth (AUTH-*), verification (VER-*), shifts (SHF-*), applications/
 * invitations (APP/INV), messaging (MSG), completion (CMP), reviews (REV),
 * cases (SUP), admin/ops tools (ADM), risk (RSK).
 */
@Module({
  imports: [HealthModule, OffersModule, BookingsModule, PaymentsModule],
})
export class AppModule {}
