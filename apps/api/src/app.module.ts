import { Module } from "@nestjs/common";
import { HealthModule } from "./modules/health/health.module.js";
import { MarketplaceModule } from "./modules/marketplace/marketplace.module.js";
import { AuthModule } from "./modules/auth/auth.module.js";

/**
 * Bounded contexts (PRD §7.1 data groups). MarketplaceModule composes offers,
 * bookings, and payments into the Phase 0 booking flow. Additional modules to add
 * as scaffold grows: auth (AUTH-*), verification (VER-*), shifts (SHF-*),
 * messaging (MSG), completion (CMP), reviews (REV), cases (SUP), admin/ops (ADM).
 */
@Module({
  imports: [HealthModule, AuthModule, MarketplaceModule],
})
export class AppModule {}
