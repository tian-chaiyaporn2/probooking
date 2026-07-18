/**
 * Ready-made demo logins for the "sign in as" picker. The clinic owner and professional
 * are seeded by the demo fixtures (apps/api/src/fixtures/demo-fixtures.ts) with these exact
 * phones; the ops/finance phones come from STAFF_PHONES. Under AUTH_DEV_MODE the OTP code is
 * echoed back, so a click signs in in one step.
 *
 * Session persistence lives in `lib/session.ts` (canonical store) — re-exported here so
 * existing imports keep working.
 */
import type { SessionRole } from "./session";
import {
  DEMO_ACCOUNTS_DATA,
  DEMO_PARTY_ACCOUNTS_DATA,
  DEMO_STAFF_ACCOUNTS_DATA,
  type DemoAccountData,
  type DemoGroup,
  type DemoIcon,
} from "./demo-accounts.data";

export type { SessionRole };
export { saveSession, loadSession, clearSession } from "./session";
export type { DemoIcon, DemoGroup };
export {
  DEMO_ACCOUNTS_DATA,
  DEMO_PARTY_ACCOUNTS_DATA,
  DEMO_STAFF_ACCOUNTS_DATA,
};

export interface DemoAccount extends DemoAccountData {
  role: SessionRole;
}

export const DEMO_ACCOUNTS: DemoAccount[] = DEMO_ACCOUNTS_DATA as DemoAccount[];

export const DEMO_PARTY_ACCOUNTS = DEMO_PARTY_ACCOUNTS_DATA as DemoAccount[];
export const DEMO_STAFF_ACCOUNTS = DEMO_STAFF_ACCOUNTS_DATA as DemoAccount[];

/** Resolve display label for a session (phone wins over role — e.g. finance approver). */
export function demoAccountLabel(phone: string, role?: SessionRole): string | null {
  const byPhone = DEMO_ACCOUNTS.find((a) => a.phone === phone);
  if (byPhone) return byPhone.label;
  if (role === "clinic") return null;
  if (role === "professional") return null;
  if (role === "operations") return DEMO_ACCOUNTS.find((a) => a.role === "operations")?.label ?? null;
  if (role === "finance") return DEMO_ACCOUNTS.find((a) => a.role === "finance")?.label ?? null;
  return null;
}
