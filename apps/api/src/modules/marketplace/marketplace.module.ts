import { Module } from "@nestjs/common";
import { OffersModule } from "../offers/offers.module.js";
import { BookingsModule } from "../bookings/bookings.module.js";
import { PaymentsModule } from "../payments/payments.module.js";
import { MarketplaceController } from "./marketplace.controller.js";
import { MarketplaceStore } from "./marketplace.store.js";

@Module({
  imports: [OffersModule, BookingsModule, PaymentsModule],
  controllers: [MarketplaceController],
  providers: [MarketplaceStore],
})
export class MarketplaceModule {}
