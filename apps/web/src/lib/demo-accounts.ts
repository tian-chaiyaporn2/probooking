/**
 * Ready-made demo logins for the "sign in as" picker. The clinic owner and professional
 * are seeded by the demo fixtures (apps/api/src/fixtures/demo-fixtures.ts) with these exact
 * phones; the ops/finance phones come from STAFF_PHONES. Under AUTH_DEV_MODE the OTP code is
 * echoed back, so a click signs in in one step.
 */
export interface DemoAccount {
  /** Stable, unique key for this card (used for the sign-in testid). */
  id: string;
  phone: string;
  label: string;
  sublabel: string;
  role: "clinic" | "professional" | "operations" | "finance";
  /** Where to land after signing in. */
  route: string;
  emoji: string;
}

export const DEMO_ACCOUNTS: DemoAccount[] = [
  {
    id: "clinic",
    phone: "+66910000001",
    label: "คลินิกสุขุมวิทสไมล์",
    sublabel: "เจ้าของคลินิก — ประกาศเวร ส่งข้อเสนอ ยืนยันการจอง",
    role: "clinic",
    route: "/clinic",
    emoji: "🏥",
  },
  {
    id: "professional",
    phone: "+66920000001",
    label: "นพ. สมชาย ใจดี",
    sublabel: "บุคลากร — หาเวร ยอมรับข้อเสนอ ทำงาน รับเงิน",
    role: "professional",
    route: "/pro",
    emoji: "🩺",
  },
  {
    id: "operations",
    phone: "+66900000008",
    label: "ฝ่ายปฏิบัติการ",
    sublabel: "Operations — ตรวจสอบคลินิก/บุคลากร จัดการเคส",
    role: "operations",
    route: "/ops",
    emoji: "🛡️",
  },
  {
    id: "finance",
    phone: "+66900000005",
    label: "ฝ่ายการเงิน (ผู้เสนอ)",
    sublabel: "Finance — กระทบยอด ส่งออก CSV เสนอคืนเงิน",
    role: "finance",
    route: "/finance",
    emoji: "💳",
  },
  {
    id: "finance-approver",
    phone: "+66900000006",
    label: "ฝ่ายการเงิน (ผู้อนุมัติ)",
    sublabel: "Finance — ผู้อนุมัติคนที่สองสำหรับคืนเงิน (§6.4 dual-control)",
    role: "finance",
    route: "/finance",
    emoji: "🧾",
  },
];

const KEY = "probook.session";

/** Persist the signed-in token + who, so it survives navigation between party pages. */
export function saveSession(token: string, phone: string): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ token, phone }));
  } catch {
    /* sessionStorage unavailable — the caller still holds the token in state */
  }
}

export function loadSession(): { token: string; phone: string } | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as { token: string; phone: string }) : null;
  } catch {
    return null;
  }
}

export function clearSession(): void {
  try {
    sessionStorage.removeItem(KEY);
    // Also drop staff-scoped sessions so a prior Ops/Finance login cannot bleed into
    // the next RolePicker pick (clinic/pro should not inherit a staff token).
    sessionStorage.removeItem("pb.staff.session.operations");
    sessionStorage.removeItem("pb.staff.session.finance");
  } catch {
    /* ignore */
  }
}
