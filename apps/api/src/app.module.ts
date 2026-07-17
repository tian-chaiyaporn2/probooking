import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { HealthModule } from "./modules/health/health.module.js";
import { MarketplaceModule } from "./modules/marketplace/marketplace.module.js";
import { AuthModule } from "./modules/auth/auth.module.js";
import { AuthGuard } from "./modules/auth/auth.guard.js";
import { ThrottleGuard } from "./modules/throttle/throttle.guard.js";

/**
 * Bounded contexts (PRD §7.1 data groups). MarketplaceModule composes offers,
 * bookings, payments, auth, verification, shifts, messaging, completion, reviews,
 * cases, and ops/finance into the Phase 0/1 controlled API surface.
 */
@Module({
  imports: [HealthModule, AuthModule, MarketplaceModule],
  providers: [
    // Global (§7.3). A per-handler decorator only protects the handlers someone remembered
    // to decorate — which is exactly how AuthGuard came to cover money paths late and miss
    // sensitive GETs. Auth and rate limiting fail closed by default; handlers opt OUT with
    // `@Public()` / `@NoThrottle()`.
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: ThrottleGuard },
  ],
})
export class AppModule {}
