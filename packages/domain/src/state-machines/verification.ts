/**
 * Verification lifecycle (VER-02). Applies to clinics, professionals, credentials,
 * and insurance. Manual review (VER-01) drives the transitions; every change is
 * audited (§6.4). Verified is not terminal — credentials/insurance can later be
 * Suspended or Expired (VER-04/05), and re-verification is possible.
 */
import type { VerificationState } from "../states.js";
import { assertTransition, type TransitionMap } from "./transition.js";

export const VERIFICATION_TRANSITIONS: TransitionMap<VerificationState> = {
  Draft: ["Submitted", "Closed"],
  Submitted: ["UnderReview", "NeedsInformation", "Verified", "Rejected"],
  UnderReview: ["Verified", "Rejected", "NeedsInformation"],
  NeedsInformation: ["Submitted", "UnderReview", "Rejected", "Closed"],
  // Fraud/ineligibility discovered on an already-Verified record goes straight to
  // Rejected (VER-04) — no need to launder it through Suspended first.
  Verified: ["Suspended", "Expired", "Rejected"],
  Rejected: ["Closed"],
  Suspended: ["Verified", "Closed"], // reinstatement after review
  Expired: ["Submitted", "Closed"], // re-verify
  Closed: [],
};

export const advanceVerification = (
  from: VerificationState,
  to: VerificationState,
): VerificationState => assertTransition("verification", VERIFICATION_TRANSITIONS, from, to);
