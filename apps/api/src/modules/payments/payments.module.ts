import { Logger, Module } from "@nestjs/common";
import { PaymentsService } from "./payments.service.js";
import { MockPaymentProvider, PAYMENT_PROVIDER } from "./payment.provider.js";

/**
 * Phase 0 wires the mock payment partner. Production must either set ALLOW_MOCK_PAYMENTS
 * (explicit demo/staging only) or refuse to boot — a silent mock against real bookings
 * would confirm without collecting funds.
 */
function assertMockPaymentsAllowed(): void {
  const isProd = process.env.NODE_ENV === "production";
  const allowed =
    process.env.ALLOW_MOCK_PAYMENTS === "true" ||
    process.env.AUTH_DEV_MODE === "true" ||
    !isProd;
  if (!allowed) {
    throw new Error(
      "Mock payment provider is not allowed when NODE_ENV=production unless " +
        "ALLOW_MOCK_PAYMENTS=true (demo/staging only). Wire a real PaymentProvider.",
    );
  }
  if (isProd && process.env.ALLOW_MOCK_PAYMENTS === "true") {
    new Logger("Payments").warn(
      "ALLOW_MOCK_PAYMENTS=true in production — captures/refunds are ledger-only, not real money",
    );
  }
}

assertMockPaymentsAllowed();

@Module({
  providers: [
    PaymentsService,
    MockPaymentProvider,
    { provide: PAYMENT_PROVIDER, useExisting: MockPaymentProvider },
  ],
  exports: [PaymentsService, PAYMENT_PROVIDER],
})
export class PaymentsModule {}
