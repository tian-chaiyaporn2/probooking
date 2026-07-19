import {
  Controller,
  ForbiddenException,
  Get,
  Inject,
  Post,
  UseGuards,
} from "@nestjs/common";
import { AuthGuard, Roles, Public } from "../../auth/auth.guard.js";
import { maskActor } from "../privacy.util.js";
import {
  advanceOffer,
  advanceBooking,
  advancePayout,
  cancellationOutcome,
  payableFromFraction,
  isUrgentEligible,
  isExpired,
  canLeaveReview,
  can,
  dualControlSatisfied,
  satang,
  completionReviewDueAt,
  type ConfirmationContext,
  type Capability,
  type Role,
  type ShiftUrgency,
  type CancelActor,
  type CancelReason,
} from "@probook/domain";
import {
  PAYMENT_PROVIDER,
  type PaymentProvider,
} from "../../payments/payment.provider.js";
import {
  MARKETPLACE_REPOSITORY,
  type MarketplaceRepository,
} from "../marketplace.types.js";
import { HOUR_MS, csvCell, type PostShiftDto } from "./shared.js";
import { InMemoryMarketplaceStore } from "../marketplace.memory-store.js";
import { seedDemoFixtures } from "../../../fixtures/demo-fixtures.js";

/**
 * Operations dashboards and the demo reset (ADM-01, SUP-01).
 *
 * All state transitions run through @probook/domain; persistence is behind the
 * MarketplaceRepository port (Prisma/Postgres or in-memory).
 */
@Controller()
export class OpsController {
  constructor(
    @Inject(MARKETPLACE_REPOSITORY)
    private readonly repo: MarketplaceRepository,
  ) {}

  // Demo only: wipe and re-seed the in-memory store so a tester can start clean. Gated to
  // demo mode (in-memory store + AUTH_DEV_MODE) — never touches a real Postgres deployment.
  @Public()
  @Post("demo/reset")
  async resetDemo() {
    if (process.env.DATABASE_URL || process.env.AUTH_DEV_MODE !== "true") {
      throw new ForbiddenException("demo reset is only available in demo mode");
    }
    if (!(this.repo instanceof InMemoryMarketplaceStore)) {
      throw new ForbiddenException("demo reset requires the in-memory store");
    }
    this.repo.reset();
    await seedDemoFixtures(this.repo);
    this.repo.markSeeded();
    return { ok: true };
  }

  @UseGuards(AuthGuard)
  @Roles("operations", "administrator")
  @Get("ops/cases")
  async listCases() {
    return { cases: await this.repo.listOpenCases() };
  }

  @UseGuards(AuthGuard)
  @Roles("operations", "administrator")
  @Get("ops/pending")
  async listPending() {
    return { pending: await this.repo.listPendingVerifications() };
  }

  @UseGuards(AuthGuard)
  @Roles("operations", "administrator")
  @Get("ops/bookings")
  async listActiveBookings() {
    return { bookings: await this.repo.listActiveBookings() };
  }

  // REP-03: core marketplace + operations metrics for management (no liquidity dashboard).
  @UseGuards(AuthGuard)
  @Roles("operations", "administrator")
  @Get("ops/metrics")
  async metrics() {
    return this.repo.getMetrics();
  }

  // §7.3: immutable audit trail of privileged actions. Actor is masked for display
  // (least privilege). Administrator-only — it exposes who did what.
  @UseGuards(AuthGuard)
  @Roles("administrator")
  @Get("ops/audit")
  async auditTrail() {
    const rows = await this.repo.listAudit();
    return { audit: rows.map((r) => ({ ...r, actor: maskActor(r.actor) })) };
  }
}
