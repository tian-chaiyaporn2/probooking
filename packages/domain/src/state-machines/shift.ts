/**
 * Shift lifecycle (§6.2 / SHF-03). Material terms lock after an application, an
 * Interested invitation response, or an offer (SHF-04) — enforced at the service
 * layer, not here; this machine only governs coarse status.
 */
import type { ShiftState } from "../states.js";
import { assertTransition, type TransitionMap } from "./transition.js";

export const SHIFT_TRANSITIONS: TransitionMap<ShiftState> = {
  Draft: ["Published", "Cancelled", "Archived"],
  Published: ["Paused", "Closed", "Cancelled"],
  Paused: ["Published", "Closed", "Cancelled"],
  Closed: ["Archived"],
  Cancelled: ["Archived"],
  Archived: [],
};

export const advanceShift = (from: ShiftState, to: ShiftState): ShiftState =>
  assertTransition("shift", SHIFT_TRANSITIONS, from, to);
