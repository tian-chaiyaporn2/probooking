import { Module } from "@nestjs/common";
import { PaymentsService } from "./payments.service.js";
import { MockPaymentProvider, PAYMENT_PROVIDER } from "./payment.provider.js";

@Module({
  providers: [
    PaymentsService,
    MockPaymentProvider,
    { provide: PAYMENT_PROVIDER, useExisting: MockPaymentProvider },
  ],
  exports: [PaymentsService, PAYMENT_PROVIDER],
})
export class PaymentsModule {}
