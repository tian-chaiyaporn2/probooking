/**
 * Demo account catalogue (data only — safe to import from BDD/tests without client session).
 */

export type DemoIcon = "clinic" | "professional" | "operations" | "finance";
export type DemoGroup = "party" | "staff";

/** Mirrors SessionRole party/staff values used by demo cards. */
export type DemoRole =
  | "clinic"
  | "professional"
  | "operations"
  | "finance"
  | "administrator";

export interface DemoAccountData {
  id: string;
  phone: string;
  label: string;
  sublabel: string;
  role: DemoRole;
  group: DemoGroup;
  route: string;
  icon: DemoIcon;
}

export const DEMO_ACCOUNTS_DATA: DemoAccountData[] = [
  {
    id: "clinic",
    phone: "+66910000001",
    label: "คลินิกสุขุมวิทสไมล์",
    sublabel: "เจ้าของคลินิก — ประกาศเวร ส่งข้อเสนอ ยืนยันการจอง",
    role: "clinic",
    group: "party",
    route: "/clinic",
    icon: "clinic",
  },
  {
    id: "professional",
    phone: "+66920000001",
    label: "นพ. สมชาย ใจดี",
    sublabel: "บุคลากร — หาเวร ยอมรับข้อเสนอ ทำงาน รับเงิน",
    role: "professional",
    group: "party",
    route: "/pro",
    icon: "professional",
  },
  {
    id: "operations",
    phone: "+66900000008",
    label: "ฝ่ายปฏิบัติการ",
    sublabel: "ตรวจสอบคลินิกและบุคลากร จัดการเคส",
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

export const DEMO_PARTY_ACCOUNTS_DATA = DEMO_ACCOUNTS_DATA.filter(
  (a) => a.group === "party",
);
export const DEMO_STAFF_ACCOUNTS_DATA = DEMO_ACCOUNTS_DATA.filter(
  (a) => a.group === "staff",
);
