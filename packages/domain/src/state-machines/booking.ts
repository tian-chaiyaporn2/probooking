/**
 * Booking lifecycle (§6.2). A booking exists only after atomic confirmation
 * (BKG-01/02). Completion may be professional-marked + 24h auto-accept (CMP-03),
 * clinic-confirmed (CMP-02/04), or support-resolved.
 */
import type { BookingState } from "../states.js";
import { assertTransition, type TransitionMap } from "./transition.js";

export const BOOKING_TRANSITIONS: TransitionMap<BookingState> = {
  Confirmed: ["InProgress", "Cancelled"],
  InProgress: ["AwaitingCompletion", "Cancelled"],
  AwaitingCompletion: ["ServiceCompleted", "Cancelled"],
  ServiceCompleted: ["Archived"],
  Cancelled: ["Archived"],
  Archived: [],
};

export const advanceBooking = (from: BookingState, to: BookingState): BookingState =>
  assertTransition("booking", BOOKING_TRANSITIONS, from, to);
