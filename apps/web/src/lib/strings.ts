/**
 * Thai UI copy (LOC-01: the platform launches in Thai). Centralised so the staff- and
 * user-facing surfaces render Thai under <html lang="th">. Numbers/brand stay as-is; the
 * /flow page is a developer/e2e demo harness and is intentionally left in English.
 */
export const th = {
  brand: "ProBooking",
  home: {
    tagline: "หาเวรคลินิกได้บุคลากรที่ตรวจสอบแล้ว จ่ายเงินอย่างปลอดภัย",
    description:
      "ตลาดสองด้านสำหรับเวรคลินิกชั่วคราว คลินิกค้นหา เปรียบเทียบ เชิญ และจองบุคลากรที่ผ่านการตรวจสอบ ส่วนบุคลากรควบคุมเวลาว่าง ยอมรับเงื่อนไขที่ชัดเจน และรับเงินที่ตรวจสอบได้",
    phase: "เฟส 0 — คอนเซียร์จ กรุงเทพฯ และปริมณฑล",
    metadataDescription:
      "ตลาดสองด้านสำหรับเวรคลินิกชั่วคราวในประเทศไทย จองบุคลากรที่ตรวจสอบแล้ว พร้อมการชำระเงินที่คุ้มครอง",
    ctaPrimary: "ทดลองขั้นตอนการจอง",
    ctaSecondary: "ดูวิธีทำงาน",
    trust: ["ตรวจสอบแล้ว", "พร้อมทำงาน", "จองได้", "คุ้มครองการชำระเงิน"],
    howTitle: "ทำงานอย่างไร",
    howSubtitle: "จากประกาศเวรถึงจ่ายเงิน สี่ขั้นตอนที่ตรวจสอบได้",
    steps: [
      { t: "ประกาศเวร", d: "คลินิกที่ตรวจสอบแล้วลงเวรที่เปิดรับ พร้อมเงื่อนไขและค่าตอบแทนที่ชัดเจน" },
      { t: "เชิญและเสนอ", d: "บุคลากรสมัครหรือถูกเชิญ คลินิกส่งข้อเสนอผูกพันหนึ่งฉบับ" },
      { t: "ยืนยันและคุ้มครองเงิน", d: "ยอมรับข้อเสนอแล้วกันเงินไว้ (Payment Protected) ก่อนยืนยันการจอง" },
      { t: "ทำงานและรับเงิน", d: "เมื่อเสร็จงาน ระบบจ่ายเงินให้บุคลากรพร้อมบันทึกที่ตรวจสอบได้" },
    ],
    surfacesTitle: "เข้าใช้งาน",
    surfacesSubtitle: "เลือกพื้นผิวที่ต้องการ — เดโมจอง ปฏิบัติการ หรือการเงิน",
    flowLink: "ทดลองขั้นตอนการจอง",
    flowDesc: "เดโมสำหรับนักพัฒนา — เดินครบทั้งขั้นตอนตั้งแต่จองถึงจ่ายเงิน",
    opsLink: "แดชบอร์ดฝ่ายปฏิบัติการ",
    opsDesc: "ตรวจสอบคลินิกและบุคลากร จัดการเคสและการระงับ",
    financeLink: "การกระทบยอดฝ่ายการเงิน",
    financeDesc: "กระทบยอดคำสั่งชำระเงินและตรวจสอบการอนุรักษ์ยอด",
    open: "เปิด",
  },
  flow: {
    title: "ทดลองขั้นตอนการจอง",
    subtitle:
      "เดโมนี้เดินครบทั้งขั้นตอน: ลงทะเบียนและตรวจสอบคลินิกกับบุคลากร สร้างข้อเสนอผูกพัน ยอมรับ (กันเงินไว้) ยืนยันการจอง ทำงานให้เสร็จ จ่ายเงิน แล้วรีวิว",
    run: "เริ่มขั้นตอนการจอง",
    running: "กำลังเดินขั้นตอน…",
    steps: "ขั้นตอน",
  },
  common: {
    refresh: "รีเฟรช",
    none: "ไม่มี",
    emptyTable: "ยังไม่มีรายการ",
    error: "ข้อผิดพลาด",
    loading: "กำลังโหลด…",
  },
  nav: {
    home: "หน้าแรก",
    ops: "ปฏิบัติการ",
    finance: "การเงิน",
    flow: "เดโม",
  },
  ops: {
    title: "แดชบอร์ดฝ่ายปฏิบัติการ",
    subtitle: "ตรวจสอบคลินิกและบุคลากร จัดการเคส และการระงับคุณสมบัติ",
    emptyPending: "คิวว่าง — ไม่มีรายการรอตรวจสอบ",
    emptyCases: "ไม่มีเคสที่เปิดอยู่ตอนนี้",
    metricShifts: "เวร (เปิดรับ)",
    metricBookings: "การจอง",
    metricCompleted: "เสร็จสิ้น",
    metricHeld: "ระงับไว้",
    metricCases: "เคสที่เปิด",
    metricExceptions: "รายการกระทบยอดผิดปกติ",
    pending: "รอการตรวจสอบ",
    openSuffix: "เปิดรับ",
    kind: { clinic: "คลินิก", professional: "บุคลากร" } as Record<string, string>,
    verify: "ตรวจสอบ",
    openCases: "เคสที่เปิดอยู่",
    resolveHold: "ปลดการระงับ",
  },
  finance: {
    title: "การเงิน — การกระทบยอด",
    subtitle: "กระทบยอดคำสั่งชำระเงินกับเงินที่เก็บแล้ว และตรวจการอนุรักษ์ยอด",
    exportCsv: "ส่งออก CSV (REP-02)",
    paymentOrders: "คำสั่งชำระเงิน",
    captured: "เก็บเงินแล้ว",
    payouts: "จ่ายออก",
    refunds: "คืนเงิน",
    exceptions: "รายการผิดปกติ",
    colBooking: "การจอง",
    colUndistributed: "ยังไม่กระจาย",
    colConserved: "สมดุล",
    showing: (shown: number, total: number) => `แสดง ${shown} จาก ${total} รายการ`,
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
  a11y: {
    primaryNav: "เมนูหลัก",
    openMenu: "เปิดเมนู",
    closeMenu: "ปิดเมนู",
    notifications: "การแจ้งเตือน",
    dismissNotification: "ปิดการแจ้งเตือน",
    switchToLight: "เปลี่ยนเป็นโหมดสว่าง",
    switchToDark: "เปลี่ยนเป็นโหมดมืด",
    lightMode: "โหมดสว่าง",
    darkMode: "โหมดมืด",
    skipToContent: "ข้ามไปยังเนื้อหา",
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
} as const;

/**
 * Map a raw API/network error to friendly Thai copy (from PR #9). Pairs with `errorFrom`
 * in lib/api, which already extracts the server's message; this turns that (or a network
 * failure) into a sentence the user reads, falling back to the caller's default.
 */
export function getThaiErrorMessage(error: unknown, fallback: string = th.errors.generic): string {
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  if (message.includes("too many requests") || message.startsWith("429:")) {
    return th.errors.tooManyRequests;
  }
  if (message.includes("invalid or expired code")) return th.errors.invalidOtp;
  if (message.includes("phone required")) return th.errors.phoneRequired;
  if (message.includes("requires role") || message.includes("not a member") || message.includes("forbidden") || message.startsWith("403:")) {
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

