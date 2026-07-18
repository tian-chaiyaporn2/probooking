import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { can, type Capability, type Role } from "@probook/domain";
import type { TokenPayload } from "../auth/token.util.js";
import {
  MARKETPLACE_REPOSITORY,
  type CallerIdentity,
  type MarketplaceRepository,
} from "./marketplace.types.js";

/**
 * Authority (§3) + shared read helpers, extracted from MarketplaceController so every
 * per-aggregate controller checks access the same way against one implementation.
 *
 * A token proves possession of a phone; it does NOT carry what that phone may do. These
 * helpers resolve the caller's real parties from the identity graph and check authority
 * against them — never trusting a role or party id supplied in the request body.
 */
@Injectable()
export class MarketplaceAccessService {
  constructor(
    @Inject(MARKETPLACE_REPOSITORY)
    private readonly repo: MarketplaceRepository,
  ) {}

  /** §7.3/§6.4: record a privileged action against the immutable audit trail. */
  async audit(
    user: TokenPayload | undefined,
    action: string,
    targetType: string,
    targetId: string,
    details?: Record<string, unknown>,
  ) {
    await this.repo.recordAudit({
      actor: user?.sub ?? "unknown",
      role: user?.role ?? "unknown",
      action,
      targetType,
      targetId,
      ...(details ? { details } : {}),
    });
  }

  /** Operations / administrator cross-tenant support (ADM-01). Finance is excluded. */
  isOpsCrossTenant(user?: TokenPayload): boolean {
    return user?.role === "operations" || user?.role === "administrator";
  }

  /**
   * Internal roles that may READ any party's booking history for reporting (REP-01):
   * operations, finance, and administrator — the same set the receipt endpoint allows.
   * This is a read-only reconciliation path and grants no ability to act as the party;
   * mutations still go through requireProfessional / requireClinicMember, which exclude
   * finance (isOpsCrossTenant). So finance can reconcile the books but cannot impersonate.
   */
  isInternalReader(user?: TokenPayload): boolean {
    const r = user?.role;
    return r === "operations" || r === "finance" || r === "administrator";
  }

  async identityOf(user?: TokenPayload): Promise<CallerIdentity> {
    if (!user?.sub) throw new UnauthorizedException("authentication required");
    return this.repo.resolveIdentity(user.sub);
  }

  /** Read access for a clinic member (any role) or staff — no specific capability needed. */
  async requireClinicMember(
    user: TokenPayload | undefined,
    workspaceId: string,
  ) {
    if (this.isOpsCrossTenant(user)) return;
    const me = await this.identityOf(user);
    if (!me.memberships.some((m) => m.workspaceId === workspaceId)) {
      throw new ForbiddenException("not a member of this clinic workspace");
    }
  }

  /**
   * The caller acting as this professional. Staff may act on a professional's behalf
   * (support flows); anyone else must BE them.
   */
  async requireProfessional(
    user: TokenPayload | undefined,
    professionalId: string,
  ) {
    if (this.isOpsCrossTenant(user)) return;
    const me = await this.identityOf(user);
    if (me.professionalId !== professionalId) {
      throw new ForbiddenException("not your professional profile");
    }
  }

  /**
   * The caller acting for this clinic workspace, with the authority the action needs.
   * Membership decides the role (§3), so clinic_staff cannot bind terms or move money no
   * matter what the request claims.
   */
  async requireClinicAuthority(
    user: TokenPayload | undefined,
    workspaceId: string,
    capability: Capability,
  ): Promise<Role> {
    // Cross-tenant staff support (ADM-01) is for operations/administrator only. Finance
    // holds money capabilities of its own and must not inherit clinic.pay / send_offer via
    // the old "any staff" bypass.
    if (user?.role === "operations" || user?.role === "administrator") {
      return "administrator";
    }
    if (user?.role === "finance") {
      throw new ForbiddenException(`role finance cannot ${capability}`);
    }
    const me = await this.identityOf(user);
    const membership = me.memberships.find(
      (m) => m.workspaceId === workspaceId,
    );
    if (!membership)
      throw new ForbiddenException("not a member of this clinic workspace");
    if (!can(membership.role, capability)) {
      throw new ForbiddenException(
        `role ${membership.role} cannot ${capability}`,
      );
    }
    return membership.role;
  }

  /**
   * Which side of a booking the caller is on. Returns "staff" for cross-tenant ops, who are
   * neither party but may act on both. Used to derive the cancellation actor and review
   * author rather than letting the caller declare which party they are.
   */
  async partyInBooking(
    user: TokenPayload | undefined,
    booking: { clinicWorkspaceId: string; professionalId: string },
  ): Promise<"clinic" | "professional" | "staff"> {
    if (this.isOpsCrossTenant(user)) return "staff";
    const me = await this.identityOf(user);
    if (me.professionalId && me.professionalId === booking.professionalId)
      return "professional";
    if (me.memberships.some((m) => m.workspaceId === booking.clinicWorkspaceId))
      return "clinic";
    throw new ForbiddenException("not a party to this booking");
  }

  async requireOffer(id: string) {
    const offer = await this.repo.getOffer(id);
    if (!offer) throw new NotFoundException("offer not found");
    return offer;
  }

  async requireBooking(id: string) {
    const booking = await this.repo.getBooking(id);
    if (!booking) throw new NotFoundException("booking not found");
    return booking;
  }

  async requireOpenShift(id: string) {
    const shift = await this.repo.getShift(id);
    if (!shift) throw new NotFoundException("shift not found");
    if (shift.state !== "Published" || shift.booked) {
      throw new BadRequestException("shift is not open");
    }
    return shift;
  }
}
