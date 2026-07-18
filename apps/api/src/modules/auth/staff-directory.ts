import { Injectable } from "@nestjs/common";
import { normalizePhone } from "@probook/db";

const INTERNAL_ROLES = ["operations", "finance", "administrator"] as const;
export type InternalRole = (typeof INTERNAL_ROLES)[number];

/**
 * The internal-staff access list (§3): phone → internal role, parsed from `STAFF_PHONES`
 * (`+66...:operations,+66...:finance`). Phase 1 stand-in for an admin-managed access list.
 *
 * Extracted so the AuthGuard can consult it on every request, not just the login. A token
 * carries the role that was true at login; re-checking here means removing a phone from the
 * list — suspending a staff member — takes effect on their very next request rather than an
 * hour later when the token would expire.
 */
@Injectable()
export class StaffDirectory {
  private readonly staff: Record<string, InternalRole>;

  constructor() {
    this.staff = StaffDirectory.parse(process.env.STAFF_PHONES ?? "");
  }

  static parse(spec: string): Record<string, InternalRole> {
    const out: Record<string, InternalRole> = {};
    for (const entry of spec.split(",").map((e) => e.trim()).filter(Boolean)) {
      const idx = entry.lastIndexOf(":");
      if (idx <= 0) continue;
      const phone = normalizePhone(entry.slice(0, idx).trim());
      const role = entry.slice(idx + 1).trim();
      if (phone && (INTERNAL_ROLES as readonly string[]).includes(role)) {
        out[phone] = role as InternalRole;
      }
    }
    return out;
  }

  /** The internal role currently granted to this phone, or undefined if it is not staff. */
  roleFor(phone: string): InternalRole | undefined {
    return this.staff[normalizePhone(phone)];
  }

  /**
   * Suspend a staff phone at runtime. Because the guard resolves authority from this
   * directory on every request, removing the entry here makes the change take effect on the
   * suspended member's very next request — and their next login resolves to an ordinary
   * user — without an env change or a restart. Returns whether they were staff.
   */
  suspend(phone: string): boolean {
    const key = normalizePhone(phone);
    if (!(key in this.staff)) return false;
    delete this.staff[key];
    return true;
  }

  /** Grant (or restore) an internal role at runtime. */
  grant(phone: string, role: InternalRole): void {
    this.staff[normalizePhone(phone)] = role;
  }

  static isInternalRole(role: string): role is InternalRole {
    return (INTERNAL_ROLES as readonly string[]).includes(role);
  }
}
