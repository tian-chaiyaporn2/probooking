import { Module, Logger } from "@nestjs/common";
import { OffersModule } from "../offers/offers.module.js";
import { BookingsModule } from "../bookings/bookings.module.js";
import { PaymentsModule } from "../payments/payments.module.js";
import { AuthModule } from "../auth/auth.module.js";
import { devAuthEnabled } from "../auth/dev-mode.util.js";
import { OnboardingController } from "./controllers/onboarding.controller.js";
import { MessagingController } from "./controllers/messaging.controller.js";
import { ShiftsController } from "./controllers/shifts.controller.js";
import { FinanceController } from "./controllers/finance.controller.js";
import { OpsController } from "./controllers/ops.controller.js";
import { OffersController } from "./controllers/offers.controller.js";
import { BookingsController } from "./controllers/bookings.controller.js";
import { ReviewsController } from "./controllers/reviews.controller.js";
import { ReportingController } from "./controllers/reporting.controller.js";
import { NotificationsService } from "./notifications.service.js";
import { MarketplaceAccessService } from "./marketplace-access.service.js";
import {
  MARKETPLACE_REPOSITORY,
  type MarketplaceRepository,
} from "./marketplace.types.js";
import { MarketplaceSeedService } from "../../fixtures/marketplace-seed.service.js";

/**
 * Selects the persistence backend at boot: Prisma/Postgres when DATABASE_URL is set,
 * otherwise the in-memory store when explicitly opted in (demo). Dynamic imports keep
 * Prisma (and its client construction) out of the process entirely in the in-memory case.
 */
const marketplaceRepositoryProvider = {
  provide: MARKETPLACE_REPOSITORY,
  useFactory: async (): Promise<MarketplaceRepository> => {
    const logger = new Logger("Marketplace");
    if (process.env.DATABASE_URL) {
      const { PrismaMarketplaceStore } =
        await import("./marketplace.prisma-store.js");
      logger.log("Using Prisma/Postgres store");
      return new PrismaMarketplaceStore();
    }
    if (process.env.ALLOW_IN_MEMORY_STORE === "true" || devAuthEnabled()) {
      const { InMemoryMarketplaceStore } =
        await import("./marketplace.memory-store.js");
      logger.log(
        "Using in-memory store (ALLOW_IN_MEMORY_STORE or AUTH_DEV_MODE)",
      );
      return new InMemoryMarketplaceStore();
    }
    throw new Error(
      "DATABASE_URL is required unless ALLOW_IN_MEMORY_STORE=true or AUTH_DEV_MODE=true (demo only)",
    );
  },
};

@Module({
  imports: [OffersModule, BookingsModule, PaymentsModule, AuthModule],
  controllers: [
    OnboardingController,
    MessagingController,
    ShiftsController,
    FinanceController,
    OpsController,
    OffersController,
    BookingsController,
    ReviewsController,
    ReportingController,
  ],
  providers: [
    marketplaceRepositoryProvider,
    MarketplaceAccessService,
    NotificationsService,
    MarketplaceSeedService,
  ],
})
export class MarketplaceModule {}
