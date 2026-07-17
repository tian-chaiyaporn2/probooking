import { Inject, Injectable, Logger, OnModuleInit } from "@nestjs/common";
import {
  MARKETPLACE_REPOSITORY,
  type MarketplaceRepository,
} from "../modules/marketplace/marketplace.types.js";
import { InMemoryMarketplaceStore } from "../modules/marketplace/marketplace.memory-store.js";
import { seedDemoFixtures } from "./demo-fixtures.js";

/** Returns true when demo fixtures should load at API boot. */
export function shouldSeedOnBoot(): boolean {
  if (process.env.SEED_ON_BOOT === "false") return false;
  // In-memory mode (no Postgres): seed by default so /ops and /finance have data.
  if (!process.env.DATABASE_URL) return true;
  return process.env.SEED_ON_BOOT === "true";
}

/**
 * Loads deterministic demo fixtures into the in-memory store on boot. Postgres
 * deployments use `pnpm db:seed` instead unless SEED_ON_BOOT=true.
 */
@Injectable()
export class MarketplaceSeedService implements OnModuleInit {
  private readonly logger = new Logger(MarketplaceSeedService.name);

  constructor(
    @Inject(MARKETPLACE_REPOSITORY) private readonly repo: MarketplaceRepository,
  ) {}

  async onModuleInit(): Promise<void> {
    if (!shouldSeedOnBoot()) return;
    if (!(this.repo instanceof InMemoryMarketplaceStore)) {
      this.logger.warn("SEED_ON_BOOT is set but persistence is Postgres — run pnpm db:seed");
      return;
    }
    if (this.repo.isSeeded()) {
      this.logger.log("Demo fixtures already loaded — skipping");
      return;
    }
    const result = await seedDemoFixtures(this.repo);
    this.repo.markSeeded();
    this.logger.log(
      `Demo fixtures loaded: ${Object.keys(result.bookings).length} bookings, ` +
        `${Object.keys(result.shifts).length} shifts, pending verifications ready`,
    );
  }
}
