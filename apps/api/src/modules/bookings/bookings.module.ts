import { Module } from "@nestjs/common";
import { BookingsService } from "./bookings.service.js";
import { BookingsController } from "./bookings.controller.js";
import { OffersModule } from "../offers/offers.module.js";

@Module({
  imports: [OffersModule],
  controllers: [BookingsController],
  providers: [BookingsService],
})
export class BookingsModule {}
