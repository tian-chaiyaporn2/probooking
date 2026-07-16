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
  | "administrator";

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
