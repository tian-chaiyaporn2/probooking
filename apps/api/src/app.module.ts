import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { HealthModule } from "./modules/health/health.module.js";
import { MarketplaceModule } from "./modules/marketplace/marketplace.module.js";
import { AuthModule } from "./modules/auth/auth.module.js";
import { ThrottleGuard } from "./modules/throttle/throttle.guard.js";

/**
 * Bounded contexts (PRD §7.1 data groups). MarketplaceModule composes offers,
 * bookings, and payments into the Phase 0 booking flow. Additional modules to add
 * as scaffold grows: auth (AUTH-*), verification (VER-*), shifts (SHF-*),
 * messaging (MSG), completion (CMP), reviews (REV), cases (SUP), admin/ops (ADM).
 */
@Module({
  imports: [HealthModule, AuthModule, MarketplaceModule],
  providers: [
    // Global (§7.3). A per-handler decorator only protects the handlers someone remembered
    // to decorate — which is exactly how AuthGuard came to cover 15 endpoints and miss
    // every money path. Rate limiting fails the same way, so it is on by default and
    // opted OUT of, per handler.
    { provide: APP_GUARD, useClass: ThrottleGuard },
  ],
})
export class AppModule {}
