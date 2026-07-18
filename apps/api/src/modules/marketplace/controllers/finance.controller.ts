import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  Header,
  Inject,
  NotFoundException,
  Param,
  Post,
  Query,
  UnauthorizedException,
  UseGuards,
} from "@nestjs/common";
import {
  AuthGuard,
  Roles,
  CurrentUser,
  Public,
} from "../../auth/auth.guard.js";
import type { TokenPayload } from "../../auth/token.util.js";
import { maskActor, containsProhibitedPatientData } from "../privacy.util.js";
import { parseBody } from "../http-validation.js";
import { z } from "zod";
import { isConflict } from "../errors.util.js";
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
import { OffersService } from "../../offers/offers.service.js";
import { BookingsService } from "../../bookings/bookings.service.js";
import { PaymentsService } from "../../payments/payments.service.js";
import {
  PAYMENT_PROVIDER,
  type PaymentProvider,
} from "../../payments/payment.provider.js";
import { NotificationsService } from "../notifications.service.js";
import { MarketplaceAccessService } from "../marketplace-access.service.js";
import {
  MARKETPLACE_REPOSITORY,
  type MarketplaceRepository,
  type ShiftFilters,
  type ProfessionalFilters,
  type CallerIdentity,
} from "../marketplace.types.js";
import { normalizePhone } from "@probook/db";
import { HOUR_MS, csvCell, type PostShiftDto } from "./shared.js";

const proposeRefundSchema = z.object({
  bookingId: z.string().max(64),
  amount: z.number().int().positive(),
  reason: z.string().max(500),
});

/**
 * Finance: dual-control refunds, reconciliation, and the financial export (§6.4, PAY-11, REP-03).
 *
 * All state transitions run through @probook/domain; persistence is behind the
 * MarketplaceRepository port (Prisma/Postgres or in-memory).
 */
@Controller()
export class FinanceController {
  constructor(
    private readonly payments: PaymentsService,
    private readonly access: MarketplaceAccessService,
    @Inject(MARKETPLACE_REPOSITORY)
    private readonly repo: MarketplaceRepository,
  ) {}

  // ----- Operations dashboard (ADM-01) -----
  // ----- §6.4 dual control: payment exceptions -------------------------------------
  //
  // An out-of-flow refund is a high-value money action, so it needs two different
  // authorized people (§3, §6.4). `requiresDualControl`/`dualControlSatisfied` existed in
  // the domain with no caller at all — the rule was tested and unenforced. It is now a
  // proposal that one person raises and a different one executes; the DB CHECK
  // `ApprovalRequest_different_person` backs it up so no row can contradict the rule.

  @UseGuards(AuthGuard)
  @Roles("finance")
  @Post("finance/refunds")
  async proposeRefund(
    @Body() raw: { bookingId: string; amount: number; reason: string },
    @CurrentUser() user?: TokenPayload,
  ) {
    const dto = parseBody(proposeRefundSchema, raw);
    await this.access.requireBooking(dto.bookingId);
    // PAY-08 at proposal time: refuse to record a request that could never be executed.
    // Cap against *remaining* funds (captured − prior refunds − other Pending proposals),
    // not the original capture — otherwise two dual-control refunds of `captured` each
    // over-refund 2× after both execute.
    const available = await this.repo.refundAvailable(dto.bookingId);
    this.payments.assertWithinAllocation(
      satang(dto.amount),
      satang(available),
      "refund",
    );

    const approval = await this.repo.createApproval({
      capability: "finance.execute_refund",
      refType: "Booking",
      refId: dto.bookingId,
      amount: dto.amount,
      reason: dto.reason,
      initiatorId: user?.sub ?? "unknown",
      initiatorRole: user?.role ?? "unknown",
    });
    await this.access.audit(user, "propose_refund", "booking", dto.bookingId, {
      approvalId: approval.id,
      amount: dto.amount,
    });
    return { id: approval.id, state: approval.state, amount: approval.amount };
  }

  @UseGuards(AuthGuard)
  @Roles("finance", "administrator")
  @Get("finance/refunds")
  async listPendingRefunds() {
    return { pending: await this.repo.listPendingApprovals() };
  }

  // Only `finance` holds finance.execute_refund (§3). An administrator is a *different*
  // person but not an authorized one, so admin is deliberately not an approver here —
  // separation of duties is the point of the rule.
  @UseGuards(AuthGuard)
  @Roles("finance")
  @Post("finance/refunds/:id/approve")
  async approveRefund(
    @Param("id") id: string,
    @CurrentUser() user?: TokenPayload,
  ) {
    const approval = await this.repo.getApproval(id);
    if (!approval) throw new NotFoundException("approval request not found");
    if (approval.state !== "Pending") {
      throw new ConflictException(`approval is ${approval.state}`);
    }

    // §6.4: the executor must be authorized AND a different person than the initiator. The
    // domain owns both halves — checking only "ids differ" would let any second pair of
    // hands approve a payout.
    const executor = {
      id: user?.sub ?? "unknown",
      role: (user?.role ?? "unknown") as Role,
    };
    const initiator = {
      id: approval.initiatorId,
      role: approval.initiatorRole as Role,
    };
    if (
      !dualControlSatisfied(
        approval.capability as Capability,
        initiator,
        executor,
      )
    ) {
      throw new ForbiddenException(
        "§6.4: this action requires approval by a different authorized person",
      );
    }

    await this.access.requireBooking(approval.refId);
    // Re-check remaining at approve time (other refunds may have landed since proposal).
    // This Pending row is still Pending, so refundAvailable includes its own amount — add
    // it back so the executor can approve the proposal that reserved those funds.
    const availableIncludingThis =
      (await this.repo.refundAvailable(approval.refId)) + approval.amount;
    this.payments.assertWithinAllocation(
      satang(approval.amount),
      satang(availableIncludingThis),

      "refund",
    );

    try {
      const result = await this.repo.executeApproval({
        approvalId: id,
        executorId: executor.id,
        executorRole: executor.role,
        idempotencyKey: `approval-refund:${id}`,
      });
      await this.access.audit(
        user,
        "execute_refund",
        "booking",
        approval.refId,
        {
          approvalId: id,
          amount: approval.amount,
          initiatorId: approval.initiatorId,
        },
      );
      return { id, state: "Executed", ...result };
    } catch (e) {
      if (isConflict(e)) {
        const msg = (e as Error).message;
        if (
          msg.includes("exceeds remaining") ||
          msg.includes("ALLOCATION_EXCEEDED")
        ) {
          throw new BadRequestException(msg);
        }
        throw new ConflictException("approval was already executed");
      }
      throw e;
    }
  }

  // ----- Finance (PAY-11 reconciliation) -----
  @UseGuards(AuthGuard)
  @Roles("finance", "administrator")
  @Get("finance/reconciliation")
  async reconciliation() {
    return this.repo.reconcile();
  }

  // REP-02: Finance exports allocations + events + provider references as CSV.
  @UseGuards(AuthGuard)
  @Roles("finance", "administrator")
  @Header("Content-Type", "text/csv")
  @Header("Content-Disposition", 'attachment; filename="finance-export.csv"')
  @Get("finance/export")
  async financeExport() {
    const rows = await this.repo.exportFinancials();
    const header = [
      "paymentOrderId",
      "bookingId",
      "orderState",
      "orderProviderRef",
      "captured",
      "compensation",
      "serviceFee",
      "tax",
      "eventType",
      "eventAmount",
      "eventProviderRef",
      "eventAt",
    ];
    const lines = [header.join(",")];
    for (const r of rows) {
      const base = [
        r.paymentOrderId,
        r.bookingId ?? "",
        r.state,
        r.providerRef ?? "",
        r.captured,
        r.compensation ?? "",
        r.serviceFee ?? "",
        r.tax ?? "",
      ];
      if (r.events.length === 0) {
        lines.push([...base, "", "", "", ""].map(csvCell).join(","));
      } else {
        for (const e of r.events) {
          lines.push(
            [
              ...base,
              e.type,
              e.amount,
              e.providerRef ?? "",
              e.at ? new Date(e.at).toISOString() : "",
            ]
              .map(csvCell)
              .join(","),
          );
        }
      }
    }
    return lines.join("\n") + "\n";
  }
}
