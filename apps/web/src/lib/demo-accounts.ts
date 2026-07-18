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

export type { SessionRole };
export { saveSession, loadSession, clearSession } from "./session";

export type DemoIcon = "clinic" | "professional" | "operations" | "finance";

export type DemoGroup = "party" | "staff";

export interface DemoAccount {
  /** Stable, unique key for this card (used for the sign-in testid). */
  id: string;
  phone: string;
  label: string;
  sublabel: string;
  role: SessionRole;
  /** Party (clinic/pro) vs internal staff surfaces. */
  group: DemoGroup;
  /** Where to land after signing in. */
  route: string;
  /** Icon key mapped in RolePicker (no emoji). */
  icon: DemoIcon;
}

export const DEMO_ACCOUNTS: DemoAccount[] = [
  {
    id: "clinic",
    phone: "+66910000001",
    label: "คลินิกสุขุมวิทสไมล์",
    sublabel: "เจ้าของคลินิก ประกาศเวร ส่งข้อเสนอ ยืนยันการจอง",
    role: "clinic",
    group: "party",
    route: "/clinic",
    icon: "clinic",
  },
  {
    id: "professional",
    phone: "+66920000001",
    label: "นพ. สมชาย ใจดี",
    sublabel: "บุคลากร หาเวร ยอมรับข้อเสนอ ทำงาน รับเงิน",
    role: "professional",
    group: "party",
    route: "/pro",
    icon: "professional",
  },
  {
    id: "operations",
    phone: "+66900000008",
    label: "ฝ่ายปฏิบัติการ",
    sublabel: "ตรวจสอบคลินิก/บุคลากร จัดการเคส",
    role: "operations",
    group: "staff",
    route: "/ops",
    icon: "operations",
  },
  {
    id: "finance",
    phone: "+66900000005",
    label: "ฝ่ายการเงิน (ผู้เสนอ)",
    sublabel: "กระทบยอด ส่งออก CSV เสนอคืนเงิน",
    role: "finance",
    group: "staff",
    route: "/finance",
    icon: "finance",
  },
  {
    id: "finance-approver",
    phone: "+66900000006",
    label: "ฝ่ายการเงิน (ผู้อนุมัติ)",
    sublabel: "ผู้อนุมัติคนที่สองสำหรับการคืนเงิน — ต้องมีผู้อนุมัติสองคน",
    role: "finance",
    group: "staff",
    route: "/finance",
    icon: "finance",
  },
];

export const DEMO_PARTY_ACCOUNTS = DEMO_ACCOUNTS.filter((a) => a.group === "party");
export const DEMO_STAFF_ACCOUNTS = DEMO_ACCOUNTS.filter((a) => a.group === "staff");
