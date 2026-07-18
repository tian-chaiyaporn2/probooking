import type { SessionRole } from "./session";

const STAFF_ROLES = new Set<SessionRole>([
  "operations",
  "finance",
  "administrator",
]);
const PARTY_ROLES = new Set<SessionRole>(["clinic", "professional"]);

export function isStaffRoute(path?: string): boolean {
  return path === "/ops" || path === "/finance";
}

export function isPartyRoute(path?: string): boolean {
  return path === "/clinic" || path === "/pro";
}

/** Whether the stored session role should surface a workspace link on this page. */
export function sessionShowsWorkspace(
  role: SessionRole | undefined,
  current?: string,
): boolean {
  if (!role) return false;
  if (!current) return true;
  if (isStaffRoute(current) && PARTY_ROLES.has(role)) return false;
  if (isPartyRoute(current) && STAFF_ROLES.has(role)) return false;
  return true;
}

export function isStaffRole(role: SessionRole | undefined): boolean {
  return role !== undefined && STAFF_ROLES.has(role);
}
