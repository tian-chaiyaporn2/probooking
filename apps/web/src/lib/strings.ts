/**
 * Thai UI copy (LOC-01: the platform launches in Thai). Centralised so the staff- and
 * user-facing surfaces render Thai under <html lang="th">. Numbers/brand stay as-is; the
 * /flow page is a developer/e2e demo harness and is intentionally left in English.
 */
const trustPillars = ["ตรวจสอบแล้ว", "พร้อมรับเวร", "จองได้", "คุ้มครองการชำระเงิน"] as const;

const pendingKindLabels: Record<string, string> = {
  clinic: "คลินิก",
  professional: "บุคลากร",
};

const caseKindLabels: Record<string, string> = {
  credential_hold: "ตรวจสอบใบอนุญาตหรือประกัน",
  completion_review: "ตรวจสอบการจบเวร",
  cancellation_support: "ช่วยเหลือการยกเลิก",
};

const caseStateLabels: Record<string, string> = {
  Open: "เปิดอยู่",
  AwaitingUser: "รอข้อมูลจากผู้ใช้",
  UnderReview: "กำลังตรวจสอบ",
  Resolved: "แก้ไขแล้ว",
  Reopened: "เปิดอีกครั้ง",
};

export const th = {
  brand: "ProBooking",
  home: {
    trustPillars,
    tagline: trustPillars.join(" • "),
    description:
      "แพลตฟอร์มสำหรับค้นหาและจองแพทย์และทันตแพทย์ที่ผ่านการตรวจสอบเพื่อเข้าเวรชั่วคราว คลินิกสามารถค้นหา เปรียบเทียบ เชิญ และจองได้ในที่เดียว ส่วนแพทย์และทันตแพทย์สามารถจัดการเวลาว่าง เลือกตอบรับข้อเสนอที่มีเงื่อนไขชัดเจน และติดตามสถานะการรับเงินได้",
    phase: "เฟส 0 — ทดลองให้บริการในกรุงเทพฯ และปริมณฑล",
    flowLink: "เดโมขั้นตอนการจอง (สำหรับนักพัฒนา)",
    opsLink: "แดชบอร์ดฝ่ายปฏิบัติการ",
    financeLink: "แดชบอร์ดฝ่ายการเงิน",
    footer: "ProBooking · เฟส 0 · กรุงเทพฯ และปริมณฑล",
    metadataDescription:
      "ค้นหาและจองแพทย์และทันตแพทย์ที่ผ่านการตรวจสอบ พร้อมระบบคุ้มครองการชำระเงิน",
  },
  common: {
    refresh: "รีเฟรช",
    open: "เปิดดู →",
    none: "ยังไม่มีรายการ",
    loadError: "โหลดข้อมูลไม่สำเร็จ กรุณาลองใหม่อีกครั้ง",
    loading: "กำลังโหลด…",
  },
  errors: {
    generic: "เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง",
    connection: "เชื่อมต่อระบบไม่สำเร็จ กรุณาลองอีกครั้ง",
    noPermission: "บัญชีนี้ไม่มีสิทธิ์เข้าถึงหน้านี้",
    sessionExpired: "เซสชันหมดอายุ กรุณารีเฟรชหน้าแล้วเข้าสู่ระบบอีกครั้ง",
    tooManyRequests: "ส่งคำขอถี่เกินไป กรุณารอสักครู่แล้วลองอีกครั้ง",
    phoneRequired: "กรุณากรอกหมายเลขโทรศัพท์",
    invalidOtp: "รหัส OTP ไม่ถูกต้องหรือหมดอายุแล้ว กรุณาลองอีกครั้งหรือขอรหัสใหม่",
  },
  nav: {
    home: "หน้าแรก",
    ops: "ปฏิบัติการ",
    finance: "การเงิน",
    flow: "เดโม",
  },
  a11y: {
    primaryNav: "เมนูหลัก",
    notifications: "การแจ้งเตือน",
    dismissNotification: "ปิดการแจ้งเตือน",
    switchToLight: "เปลี่ยนเป็นโหมดสว่าง",
    switchToDark: "เปลี่ยนเป็นโหมดมืด",
    lightMode: "โหมดสว่าง",
    darkMode: "โหมดมืด",
  },
  staffLogin: {
    title: {
      operations: "เข้าสู่ระบบฝ่ายปฏิบัติการ",
      finance: "เข้าสู่ระบบฝ่ายการเงิน",
    },
    description:
      "เข้าสู่ระบบด้วยหมายเลขโทรศัพท์ของเจ้าหน้าที่ที่ได้รับอนุญาต ระบบจะส่งรหัส OTP ทาง SMS",
    phoneLabel: "หมายเลขโทรศัพท์ของเจ้าหน้าที่",
    sendCode: "ส่งรหัส OTP",
    codeLabel: "รหัส OTP",
    codePlaceholder: "รหัส 6 หลัก",
    signIn: "เข้าสู่ระบบ",
    requestNewCode: "กลับไปขอรหัสใหม่",
    sendCodeError: "ส่งรหัส OTP ไม่สำเร็จ กรุณาลองอีกครั้ง",
    signInError: "เข้าสู่ระบบไม่สำเร็จ กรุณาตรวจสอบรหัส OTP แล้วลองอีกครั้ง",
  },
  ops: {
    title: "แดชบอร์ดฝ่ายปฏิบัติการ",
    metricShifts: "เวรทั้งหมด",
    shiftsValue: (total: number, open: number) => `${total} (เปิดรับ ${open})`,
    metricBookings: "การจองทั้งหมด",
    metricCompleted: "การจองที่เสร็จสิ้น",
    metricHeld: "การจองที่ถูกระงับ",
    metricCases: "เคสที่เปิดอยู่",
    metricExceptions: "ยอดจ่ายเกินยอดรับชำระ",
    pending: "รายการรอตรวจสอบ",
    verify: "อนุมัติ",
    openCases: "เคสที่เปิดอยู่",
    resolveHold: "ยกเลิกการระงับ",
    pendingKind: (kind: string) => pendingKindLabels[kind] ?? "รายการ",
    caseKind: (kind: string) => caseKindLabels[kind] ?? "เคสอื่น ๆ",
    caseState: (state: string) => caseStateLabels[state] ?? "ไม่ทราบสถานะ",
    verified: (kind: string) =>
      `อนุมัติ${pendingKindLabels[kind] ?? "รายการ"}เรียบร้อยแล้ว`,
    verifyError: "อนุมัติรายการไม่สำเร็จ กรุณาลองใหม่อีกครั้ง",
    holdResolved: "ยกเลิกการระงับเรียบร้อยแล้ว",
    resolveHoldError: "ยกเลิกการระงับไม่สำเร็จ กรุณาลองใหม่อีกครั้ง",
  },
  finance: {
    title: "การเงินและการกระทบยอด",
    exportCsv: "ดาวน์โหลดรายงาน CSV",
    exportStarted: "เริ่มดาวน์โหลดรายงาน CSV แล้ว",
    exportError: "ดาวน์โหลดรายงานไม่สำเร็จ กรุณาลองใหม่อีกครั้ง",
    paymentOrders: "คำสั่งชำระเงิน",
    captured: "ยอดรับชำระแล้ว",
    payouts: "ยอดโอนจ่าย",
    refunds: "ยอดคืนเงิน",
    exceptions: "ยอดจ่ายเกินยอดรับชำระ",
    colBooking: "รหัสการจอง",
    colUndistributed: "ยอดคงเหลือ",
    colConserved: "สถานะยอดจ่าย",
    reconciliationOk: "ยอดจ่ายไม่เกินยอดรับชำระ",
    reconciliationIssue: "ยอดจ่ายเกินยอดรับชำระ",
    showing: (shown: number, total: number) => `แสดง ${shown} จากทั้งหมด ${total} รายการ`,
  },
} as const;

/** Turn common API/network failures into useful Thai feedback instead of exposing raw server text. */
export function getThaiErrorMessage(error: unknown, fallback: string = th.errors.generic): string {
  const message = error instanceof Error ? error.message.toLowerCase() : "";

  if (message.includes("too many requests") || message.startsWith("429:")) {
    return th.errors.tooManyRequests;
  }
  if (message.includes("invalid or expired code")) return th.errors.invalidOtp;
  if (message.includes("phone required")) return th.errors.phoneRequired;
  if (message.includes("requires role") || message.startsWith("403:")) {
    return th.errors.noPermission;
  }
  if (message.includes("authentication required") || message.startsWith("401:")) {
    return th.errors.sessionExpired;
  }
  if (
    message.includes("failed to fetch") ||
    message.includes("fetch failed") ||
    message.includes("network") ||
    message.includes("timeout") ||
    message.includes("abort")
  ) {
    return th.errors.connection;
  }

  return fallback;
}
