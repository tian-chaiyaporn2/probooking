import { describe, it, expect, vi } from "vitest";
import {
  BadRequestException,
  ConflictException,
  InternalServerErrorException,
} from "@nestjs/common";
import { InMemoryMarketplaceStore } from "../src/modules/marketplace/marketplace.memory-store.js";
import { ConflictError, EligibilityError } from "../src/modules/marketplace/errors.util.js";
import { OffersController } from "../src/modules/marketplace/controllers/offers.controller.js";
import { OffersService } from "../src/modules/offers/offers.service.js";
import { BookingsService } from "../src/modules/bookings/bookings.service.js";
import { PaymentsService } from "../src/modules/payments/payments.service.js";
import { NotificationsService } from "../src/modules/marketplace/notifications.service.js";
import { MarketplaceAccessService } from "../src/modules/marketplace/marketplace-access.service.js";
import type { MarketplaceRepository } from "../src/modules/marketplace/marketplace.types.js";
import type { PaymentProvider } from "../src/modules/payments/payment.provider.js";
import type { TokenPayload } from "../src/modules/auth/token.util.js";

/**
 * Regression coverage for the marketplace bugfix batch:
 * - PaymentFailed soft holds (AVL-03)
 * - acceptOffer overlap claim
 * - confirmBooking in-transaction eligibility
 * - confirm refund outcome must be checked
 */

let seq = 0;
const uniq = () => `bf${Date.now()}${seq++}`;

async function seedVerifiedPair(store: MarketplaceRepository) {
  const n = uniq();
  const clinic = await store.registerClinic({
    branchName: `C ${n}`,
    licenceNo: "L",
    address: "BKK",
    ownerPhone: `+66c${n}`,
  });
  await store.verifyClinic(clinic.id);
  const pro = await store.registerProfessional({
    displayName: "P",
    profession: "nurse",
    phone: `+66p${n}`,
    payoutRef: "x",
  });
  await store.verifyProfessional(pro.id);
  return { clinic, pro };
}

async function seedPendingOffer(
  store: MarketplaceRepository,
  clinicId: string,
  professionalId: string,
  shiftStart: number,
) {
  const { shiftId } = await store.postShift({
    clinicWorkspaceId: clinicId,
    category: "general",
    compensation: 1_000_000,
    urgency: "standard",
    shiftStart,
    insuranceRequired: false,
  });
  await store.applyToShift(shiftId, professionalId);
  const offer = await store.createOfferForShift({
    shiftId,
    professionalId,
    sentAt: Date.now(),
    expiresAt: Date.now() + 12 * 3_600_000,
  });
  return { shiftId, offer };
}

describe("marketplace bugfixes (memory store)", () => {
  it("treats PaymentFailed as a soft hold that blocks overlapping acceptance (AVL-03)", async () => {
    const store = new InMemoryMarketplaceStore();
    const { clinic, pro } = await seedVerifiedPair(store);
    const start = Date.now() + 48 * 3_600_000;
    const a = await seedPendingOffer(store, clinic.id, pro.id, start);
    await store.setOfferState(a.offer.id, "AwaitingPayment", {
      fundingDueAt: Date.now() + 30 * 60_000,
    });
    await store.setOfferState(a.offer.id, "PaymentFailed");

    const b = await seedPendingOffer(store, clinic.id, pro.id, start + 60 * 60_000);
    await expect(
      store.acceptOffer(b.offer.id, { fundingDueAt: Date.now() + 30 * 60_000 }),
    ).rejects.toBeInstanceOf(ConflictError);

    expect(
      await store.hasScheduleOverlap(pro.id, start, start + 4 * 3_600_000, {
        excludeOfferId: b.offer.id,
      }),
    ).toBe(true);
  });

  it("acceptOffer claims PendingResponse → AwaitingPayment only when the window is free", async () => {
    const store = new InMemoryMarketplaceStore();
    const { clinic, pro } = await seedVerifiedPair(store);
    const start = Date.now() + 72 * 3_600_000;
    const a = await seedPendingOffer(store, clinic.id, pro.id, start);
    const claimed = await store.acceptOffer(a.offer.id, {
      fundingDueAt: Date.now() + 30 * 60_000,
    });
    expect(claimed?.state).toBe("AwaitingPayment");

    const b = await seedPendingOffer(store, clinic.id, pro.id, start + 30 * 60_000);
    await expect(
      store.acceptOffer(b.offer.id, { fundingDueAt: Date.now() + 30 * 60_000 }),
    ).rejects.toMatchObject({ message: expect.stringContaining("schedule overlap") });
  });

  it("confirmBooking refuses when the required credential was suspended after accept (VER-04)", async () => {
    const store = new InMemoryMarketplaceStore();
    const { clinic, pro } = await seedVerifiedPair(store);
    const { shiftId, offer } = await seedPendingOffer(
      store,
      clinic.id,
      pro.id,
      Date.now() + 48 * 3_600_000,
    );
    await store.setOfferState(offer.id, "AwaitingPayment", {
      fundingDueAt: Date.now() + 30 * 60_000,
    });
    await store.suspendCredential(pro.id);

    await expect(
      store.confirmBooking({
        offerId: offer.id,
        shiftId,
        clinicWorkspaceId: clinic.id,
        professionalId: pro.id,
        allocation: { compensation: 1_000_000, serviceFee: 120_000, tax: 0 },
        captured: 1_120_000,
        idempotencyKey: `collection:${offer.id}`,
      }),
    ).rejects.toBeInstanceOf(EligibilityError);

    expect(await store.getBookingByOffer(offer.id)).toBeNull();
    expect((await store.getOffer(offer.id))?.state).toBe("AwaitingPayment");
  });

  it("confirmBooking refuses overlapping confirms for the same professional (AVL-03)", async () => {
    const store = new InMemoryMarketplaceStore();
    const { clinic, pro } = await seedVerifiedPair(store);
    const start = Date.now() + 96 * 3_600_000;
    const a = await seedPendingOffer(store, clinic.id, pro.id, start);
    const b = await seedPendingOffer(store, clinic.id, pro.id, start + 60 * 60_000);
    await store.setOfferState(a.offer.id, "AwaitingPayment", {
      fundingDueAt: Date.now() + 30 * 60_000,
    });

    await store.confirmBooking({
      offerId: a.offer.id,
      shiftId: a.shiftId,
      clinicWorkspaceId: clinic.id,
      professionalId: pro.id,
      allocation: { compensation: 1_000_000, serviceFee: 120_000, tax: 0 },
      captured: 1_120_000,
      idempotencyKey: `collection:${a.offer.id}`,
    });

    await store.setOfferState(b.offer.id, "AwaitingPayment", {
      fundingDueAt: Date.now() + 30 * 60_000,
    });
    await expect(
      store.confirmBooking({
        offerId: b.offer.id,
        shiftId: b.shiftId,
        clinicWorkspaceId: clinic.id,
        professionalId: pro.id,
        allocation: { compensation: 1_000_000, serviceFee: 120_000, tax: 0 },
        captured: 1_120_000,
        idempotencyKey: `collection:${b.offer.id}`,
      }),
    ).rejects.toBeInstanceOf(EligibilityError);
  });
});

describe("OffersController confirm refund outcome", () => {
  it("surfaces InternalServerError when capture succeeded but refund also fails", async () => {
    const store = new InMemoryMarketplaceStore();
    const { clinic, pro } = await seedVerifiedPair(store);
    const { offer } = await seedPendingOffer(
      store,
      clinic.id,
      pro.id,
      Date.now() + 48 * 3_600_000,
    );
    await store.setOfferState(offer.id, "AwaitingPayment", {
      fundingDueAt: Date.now() + 30 * 60_000,
    });

    const paymentProvider: PaymentProvider = {
      capture: vi.fn(async () => ({ succeeded: true as const, providerRef: "cap" })),
      refund: vi.fn(async () => ({ succeeded: false as const, reason: "provider_down" })),
    };

    // Force confirmBooking to fail after capture by suspending mid-flight.
    const repo = {
      getBookingByOffer: async (id: string) => store.getBookingByOffer(id),
      getOfferEligibility: async (id: string) => store.getOfferEligibility(id),
      hasScheduleOverlap: async (...args: Parameters<MarketplaceRepository["hasScheduleOverlap"]>) =>
        store.hasScheduleOverlap(...args),
      confirmBooking: async () => {
        throw new EligibilityError(["suspended"]);
      },
      acceptOffer: store.acceptOffer.bind(store),
      setOfferState: store.setOfferState.bind(store),
    } as unknown as MarketplaceRepository;

    const access = {
      requireOffer: async () => store.getOffer(offer.id),
      requireClinicAuthority: async () => undefined,
      audit: async () => undefined,
    } as unknown as MarketplaceAccessService;

    const controller = new OffersController(
      new OffersService(),
      new BookingsService(),
      new PaymentsService(),
      paymentProvider,
      { email: async () => undefined, sms: async () => undefined } as unknown as NotificationsService,
      access,
      repo,
    );

    const user: TokenPayload = {
      sub: "+66900000000",
      role: "clinic_admin",
      exp: 0,
      iat: 0,
      jti: "t",
    };

    await expect(controller.confirm(offer.id, user)).rejects.toBeInstanceOf(
      InternalServerErrorException,
    );
    expect(paymentProvider.refund).toHaveBeenCalledOnce();
  });

  it("maps EligibilityError after a successful refund to BadRequestException", async () => {
    const store = new InMemoryMarketplaceStore();
    const { clinic, pro } = await seedVerifiedPair(store);
    const { offer } = await seedPendingOffer(
      store,
      clinic.id,
      pro.id,
      Date.now() + 48 * 3_600_000,
    );
    await store.setOfferState(offer.id, "AwaitingPayment", {
      fundingDueAt: Date.now() + 30 * 60_000,
    });

    const paymentProvider: PaymentProvider = {
      capture: vi.fn(async () => ({ succeeded: true as const, providerRef: "cap" })),
      refund: vi.fn(async () => ({ succeeded: true as const, providerRef: "ref" })),
    };

    const repo = {
      getBookingByOffer: async () => null,
      getOfferEligibility: async (id: string) => store.getOfferEligibility(id),
      hasScheduleOverlap: async () => false,
      confirmBooking: async () => {
        throw new EligibilityError(["credential_invalid_through_shift_end"]);
      },
    } as unknown as MarketplaceRepository;

    const access = {
      requireOffer: async () => store.getOffer(offer.id),
      requireClinicAuthority: async () => undefined,
      audit: async () => undefined,
    } as unknown as MarketplaceAccessService;

    const controller = new OffersController(
      new OffersService(),
      new BookingsService(),
      new PaymentsService(),
      paymentProvider,
      { email: async () => undefined, sms: async () => undefined } as unknown as NotificationsService,
      access,
      repo,
    );

    await expect(
      controller.confirm(offer.id, {
        sub: "+66900000000",
        role: "clinic_admin",
        exp: 0,
        iat: 0,
        jti: "t",
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("maps acceptOffer overlap ConflictError to BadRequestException", async () => {
    const store = new InMemoryMarketplaceStore();
    const { clinic, pro } = await seedVerifiedPair(store);
    const { offer } = await seedPendingOffer(
      store,
      clinic.id,
      pro.id,
      Date.now() + 48 * 3_600_000,
    );

    const repo = {
      acceptOffer: async () => {
        throw new ConflictError("schedule overlap (AVL-03)");
      },
    } as unknown as MarketplaceRepository;

    const access = {
      requireOffer: async () => store.getOffer(offer.id),
      requireProfessional: async () => undefined,
    } as unknown as MarketplaceAccessService;

    const controller = new OffersController(
      new OffersService(),
      new BookingsService(),
      new PaymentsService(),
      { capture: async () => ({ succeeded: true, providerRef: "x" }), refund: async () => ({ succeeded: true, providerRef: "y" }) },
      { email: async () => undefined, sms: async () => undefined } as unknown as NotificationsService,
      access,
      repo,
    );

    await expect(
      controller.accept(offer.id, {
        sub: "+66900000000",
        role: "professional",
        exp: 0,
        iat: 0,
        jti: "t",
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("maps a failed accept claim to ConflictException", async () => {
    const store = new InMemoryMarketplaceStore();
    const { clinic, pro } = await seedVerifiedPair(store);
    const { offer } = await seedPendingOffer(
      store,
      clinic.id,
      pro.id,
      Date.now() + 48 * 3_600_000,
    );

    const repo = {
      acceptOffer: async () => null,
    } as unknown as MarketplaceRepository;

    const access = {
      requireOffer: async () => store.getOffer(offer.id),
      requireProfessional: async () => undefined,
    } as unknown as MarketplaceAccessService;

    const controller = new OffersController(
      new OffersService(),
      new BookingsService(),
      new PaymentsService(),
      { capture: async () => ({ succeeded: true, providerRef: "x" }), refund: async () => ({ succeeded: true, providerRef: "y" }) },
      { email: async () => undefined, sms: async () => undefined } as unknown as NotificationsService,
      access,
      repo,
    );

    await expect(
      controller.accept(offer.id, {
        sub: "+66900000000",
        role: "professional",
        exp: 0,
        iat: 0,
        jti: "t",
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
