import { Body, Controller, Post } from "@nestjs/common";
import type { ConfirmationContext } from "@probook/domain";
import { BookingsService } from "./bookings.service.js";

@Controller("bookings")
export class BookingsController {
  constructor(private readonly bookings: BookingsService) {}

  /**
   * Demonstration endpoint. In production this is not a raw context dump — the
   * server derives the ConfirmationContext from persisted state and the payment
   * provider callback, never from client input (BKG-01, PAY-06).
   */
  @Post("confirm")
  confirm(@Body() ctx: ConfirmationContext) {
    return this.bookings.confirm(ctx);
  }
}
