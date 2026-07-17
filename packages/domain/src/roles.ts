/**
 * Roles and permissions (PRD §3).
 *
 * Binding clinic actions must record actor, authority, time, and accepted terms
 * (RULE in §3). Clinic staff may draft/search/shortlist/message but MAY NOT bind
 * terms, move money, cancel confirmed bookings, or confirm completion.
 */

export type Role =
  | "clinic_owner" // owner/admin of a clinic branch workspace
  | "clinic_staff"
  | "professional"
  | "operations"
  | "finance"
  | "administrator"
  // The background worker acting as itself (time-driven actions only, §7.2). It is a
  // platform identity, not a person: it may trigger auto-accept once a deadline has passed
  // and open Ops cases, and nothing else. Modelled as a role so those calls are
  // authenticated and attributable rather than anonymous.
  | "worker";

/** Discrete privileged capabilities referenced across the codebase. */
export type Capability =
  | "clinic.verify_branch"
  | "clinic.publish_shift"
  | "clinic.search_invite"
  | "clinic.send_offer" // binding — owner/admin only (OFF-01)
  | "clinic.pay"
  | "clinic.cancel_confirmed"
  | "clinic.confirm_completion"
  | "clinic.manage_staff"
  | "clinic.draft_shift"
  | "clinic.shortlist"
  | "message.send"
  | "pro.manage_profile"
  | "pro.manage_availability"
  | "pro.apply"
  | "pro.accept_offer"
  | "pro.mark_completion"
  | "pro.cancel_booking" // CAN-04 prices this, so the role model must be able to express it
  | "worker.auto_accept" // CMP-03, only once the booking's deadline has passed
  | "worker.flag_inactive" // CMP-04
  | "ops.verify"
  | "ops.support_matching"
  | "ops.moderate_reviews"
  | "ops.manage_cases"
  | "ops.propose_suspension"
  | "finance.execute_payout"
  | "finance.execute_refund"
  | "finance.reconcile"
  | "finance.manage_payment_exception"
  | "admin.manage_access"
  | "admin.high_risk_decision"
  | "admin.configure"
  | "admin.exceptional_approval";

const ROLE_CAPABILITIES: Record<Role, ReadonlySet<Capability>> = {
  clinic_owner: new Set([
    "clinic.verify_branch",
    "clinic.publish_shift",
    "clinic.search_invite",
    "clinic.send_offer",
    "clinic.pay",
    "clinic.cancel_confirmed",
    "clinic.confirm_completion",
    "clinic.manage_staff",
    "clinic.draft_shift",
    "clinic.shortlist",
    "message.send",
  ]),
  clinic_staff: new Set([
    "clinic.draft_shift",
    "clinic.search_invite",
    "clinic.shortlist",
    "message.send",
  ]),
  professional: new Set([
    "pro.manage_profile",
    "pro.manage_availability",
    "pro.apply",
    "pro.accept_offer",
    "pro.mark_completion",
    "pro.cancel_booking",
    "message.send",
  ]),
  operations: new Set([
    "ops.verify",
    "ops.support_matching",
    "ops.moderate_reviews",
    "ops.manage_cases",
    "ops.propose_suspension",
  ]),
  finance: new Set([
    "finance.execute_payout",
    "finance.execute_refund",
    "finance.reconcile",
    "finance.manage_payment_exception",
  ]),
  administrator: new Set([
    "admin.manage_access",
    "admin.high_risk_decision",
    "admin.configure",
    "admin.exceptional_approval",
  ]),
  // Deliberately minimal: the worker schedules, the API owns the money decision. It cannot
  // pay out on demand — only ask the API to apply a deadline that has already passed.
  worker: new Set(["worker.auto_accept", "worker.flag_inactive"]),
};

export function can(role: Role, capability: Capability): boolean {
  return ROLE_CAPABILITIES[role].has(capability);
}

/**
 * High-value or unusual money actions require a second authorized person (§3;
 * §6.4 "different-person approval"). This marks capabilities that must never be
 * executed by a single actor.
 */
export const DUAL_CONTROL_CAPABILITIES: ReadonlySet<Capability> = new Set([
  "finance.execute_payout",
  "finance.execute_refund",
  "admin.high_risk_decision",
]);

export function requiresDualControl(capability: Capability): boolean {
  return DUAL_CONTROL_CAPABILITIES.has(capability);
}

/**
 * §6.4 different-person approval: a dual-control action is satisfied only when the
 * executor is a DIFFERENT authorized person than the initiator. Non-dual-control
 * actions are always satisfiable by a single actor.
 */
export function dualControlSatisfied(
  capability: Capability,
  initiatorId: string,
  executorId: string,
): boolean {
  if (!requiresDualControl(capability)) return true;
  return initiatorId !== executorId;
}
