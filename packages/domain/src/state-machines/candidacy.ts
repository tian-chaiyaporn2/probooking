/**
 * Application, Invitation, and support-Case lifecycles (§6.2, SUP-02). These were the
 * only record states without an allow-list machine; adding them keeps illegal
 * transitions (e.g. Booked -> Submitted, Resolved -> Open) rejected consistently with
 * the other lifecycles. Applications/invitations are non-binding (APP-01) — reaching a
 * terminal state never itself creates a hold or a booking.
 */
import type { ApplicationState, InvitationState, CaseState } from "../states.js";
import { assertTransition, type TransitionMap } from "./transition.js";

export const APPLICATION_TRANSITIONS: TransitionMap<ApplicationState> = {
  Submitted: ["Shortlisted", "OfferSent", "Withdrawn", "NotSelected", "Expired"],
  Shortlisted: ["OfferSent", "Withdrawn", "NotSelected", "Expired"],
  OfferSent: ["Booked", "Declined", "Withdrawn", "Expired"],
  Booked: [],
  Withdrawn: [],
  Declined: [],
  NotSelected: [],
  Expired: [],
};

export const INVITATION_TRANSITIONS: TransitionMap<InvitationState> = {
  Sent: ["Viewed", "Declined", "Withdrawn", "Expired"],
  Viewed: ["Interested", "Declined", "Withdrawn", "Expired"],
  Interested: ["Declined", "Withdrawn", "Expired"],
  Declined: [],
  Withdrawn: [],
  Expired: [],
};

export const CASE_TRANSITIONS: TransitionMap<CaseState> = {
  Open: ["AwaitingUser", "UnderReview", "Resolved"],
  AwaitingUser: ["UnderReview", "Resolved"],
  UnderReview: ["AwaitingUser", "Resolved"],
  Resolved: ["Reopened"],
  Reopened: ["AwaitingUser", "UnderReview", "Resolved"],
};

export const advanceApplication = (from: ApplicationState, to: ApplicationState): ApplicationState =>
  assertTransition("application", APPLICATION_TRANSITIONS, from, to);

export const advanceInvitation = (from: InvitationState, to: InvitationState): InvitationState =>
  assertTransition("invitation", INVITATION_TRANSITIONS, from, to);

export const advanceCase = (from: CaseState, to: CaseState): CaseState =>
  assertTransition("case", CASE_TRANSITIONS, from, to);
