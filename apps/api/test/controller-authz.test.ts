import { describe, it, expect, vi } from "vitest";
import { ForbiddenException, UnauthorizedException } from "@nestjs/common";
import { MarketplaceController } from "../src/modules/marketplace/marketplace.controller.js";
import type {
  CallerIdentity,
  MarketplaceRepository,
} from "../src/modules/marketplace/marketplace.types.js";
import type { TokenPayload } from "../src/modules/auth/token.util.js";

/**
 * Authorization unit tests for the REP-01 reporting endpoints — the reader-vs-actor split.
 *
 * The regression these guard against (fixed in #38): party booking history must be readable
 * by internal roles (operations/finance/administrator) for reconciliation, but a plain party
 * must only ever read their OWN history — the enumerable id in the path must not become a way
 * to read someone else's money trail. Finance is a READER here, never a party actor, so it
 * must reach the read without being resolved to a party identity at all.
 *
 * These drive the real controller methods with a stub repository, so the actual predicates
 * (isInternalReader / requireProfessional / requireClinicMember) are exercised, not reimplemented.
 */

const token = (role: string, sub = "+66900000000"): TokenPayload => ({
  sub,
  role,
  exp: 0,
  iat: 0,
  jti: "t",
});

const identity = (over: Partial<CallerIdentity>): CallerIdentity => ({
  userId: "u",
  professionalId: null,
  memberships: [],
  ...over,
});

/** A controller wired to a stub repo; resolveIdentity is a spy so we can assert the reader
 * path never resolves the caller to a party. */
function makeController(resolved: CallerIdentity) {
  const resolveIdentity = vi.fn(async () => resolved);
  const listPartyBookings = vi.fn(async () => [] as never[]);
  const repo = { resolveIdentity, listPartyBookings } as unknown as MarketplaceRepository;
  // Only `repo` (the 6th constructor arg) is touched by the reporting endpoints.
  const controller = new MarketplaceController(
    undefined as never,
    undefined as never,
    undefined as never,
    undefined as never,
    undefined as never,
    repo,
  );
  return { controller, resolveIdentity, listPartyBookings };
}

describe("MarketplaceController reporting authz (REP-01)", () => {
  describe("professionals/:id/bookings", () => {
    for (const role of ["operations", "finance", "administrator"]) {
      it(`lets ${role} read any professional's history WITHOUT resolving them to a party`, async () => {
        const { controller, resolveIdentity, listPartyBookings } = makeController(identity({}));
        await expect(controller.professionalBookings("pro-1", token(role))).resolves.toEqual({
          bookings: [],
        });
        // The crux: an internal reader is never resolved to a party identity, so it can never
        // be mistaken for the party and can never mutate as one.
        expect(resolveIdentity).not.toHaveBeenCalled();
        expect(listPartyBookings).toHaveBeenCalledWith("professional", "pro-1");
      });
    }

    it("lets a professional read their OWN history", async () => {
      const { controller, resolveIdentity } = makeController(identity({ professionalId: "pro-1" }));
      await expect(controller.professionalBookings("pro-1", token("professional"))).resolves.toEqual(
        { bookings: [] },
      );
      expect(resolveIdentity).toHaveBeenCalledOnce();
    });

    it("forbids a professional reading a DIFFERENT professional's history", async () => {
      const { controller } = makeController(identity({ professionalId: "pro-2" }));
      await expect(
        controller.professionalBookings("pro-1", token("professional")),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it("rejects an unauthenticated caller", async () => {
      const { controller } = makeController(identity({}));
      await expect(controller.professionalBookings("pro-1", undefined)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });
  });

  describe("clinics/:id/bookings", () => {
    it("lets finance read any clinic's history without resolving them to a party", async () => {
      const { controller, resolveIdentity } = makeController(identity({}));
      await expect(controller.clinicBookings("clinic-1", token("finance"))).resolves.toEqual({
        bookings: [],
      });
      expect(resolveIdentity).not.toHaveBeenCalled();
    });

    it("lets a clinic member read their OWN workspace's history", async () => {
      const { controller } = makeController(
        identity({ memberships: [{ workspaceId: "clinic-1", role: "clinic_admin" as never }] }),
      );
      await expect(controller.clinicBookings("clinic-1", token("clinic_admin"))).resolves.toEqual({
        bookings: [],
      });
    });

    it("forbids a non-member reading a clinic's history", async () => {
      const { controller } = makeController(
        identity({ memberships: [{ workspaceId: "other", role: "clinic_admin" as never }] }),
      );
      await expect(controller.clinicBookings("clinic-1", token("clinic_admin"))).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });
  });
});
