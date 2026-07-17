/**
 * Booking lifecycle (§6.2). A booking exists only after atomic confirmation
 * (BKG-01/02). Completion may be professional-marked + 24h auto-accept (CMP-03),
 * clinic-confirmed (CMP-02/04), or support-resolved.
 */
import type { BookingState } from "../states.js";
import { assertTransition, type TransitionMap } from "./transition.js";

export const BOOKING_TRANSITIONS: TransitionMap<BookingState> = {
  // Confirmed -> AwaitingCompletion is the path CMP-01 actually takes. Nothing marks a
  // booking InProgress (there is no shift-start sweep), so requiring it made the real
  // transition illegal — and both stores wrote `state = "AwaitingCompletion"` directly to
  // get around the machine. A machine every caller has to bypass protects nothing: it
  // silently stopped guarding the completion path entirely.
  //
  // InProgress is kept as an optional intermediate for when a shift-start sweep exists.
  Confirmed: ["InProgress", "AwaitingCompletion", "Cancelled"],
  InProgress: ["AwaitingCompletion", "Cancelled"],
  AwaitingCompletion: ["ServiceCompleted", "Cancelled"],
  ServiceCompleted: ["Archived"],
  Cancelled: ["Archived"],
  Archived: [],
};

export const advanceBooking = (from: BookingState, to: BookingState): BookingState =>
  assertTransition("booking", BOOKING_TRANSITIONS, from, to);
