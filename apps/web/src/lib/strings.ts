/**
 * Thai UI copy (LOC-01: the platform launches in Thai). Centralised so the staff- and
 * user-facing surfaces render Thai under <html lang="th">. Numbers/brand stay as-is; the
 * /flow page is a developer/e2e demo harness and is intentionally left in English.
 */
export const th = {
  brand: "ProBooking",
  home: {
    tagline: "ตรวจสอบแล้ว • พร้อมทำงาน • จองได้ • คุ้มครองการชำระเงิน",
    description:
      "ตลาดสองด้านสำหรับเวรคลินิกชั่วคราว คลินิกค้นหา เปรียบเทียบ เชิญ และจองบุคลากรที่ผ่านการตรวจสอบ ส่วนบุคลากรควบคุมเวลาว่าง ยอมรับเงื่อนไขที่ชัดเจน และรับเงินที่ตรวจสอบได้",
    phase: "เฟส 0 — การตรวจสอบแบบคอนเซียร์จ กรุงเทพฯ และปริมณฑล",
    flowLink: "→ ทดลองขั้นตอนการจอง (เดโมสำหรับนักพัฒนา)",
    opsLink: "→ แดชบอร์ดฝ่ายปฏิบัติการ",
    financeLink: "→ การกระทบยอดฝ่ายการเงิน",
  },
  common: {
    refresh: "รีเฟรช",
    none: "ไม่มี",
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
    metricShifts: "เวร (เปิดรับ)",
    metricBookings: "การจอง",
    metricCompleted: "เสร็จสิ้น",
    metricHeld: "ระงับไว้",
    metricCases: "เคสที่เปิด",
    metricExceptions: "รายการกระทบยอดผิดปกติ",
    pending: "รอการตรวจสอบ",
    verify: "ตรวจสอบ",
    openCases: "เคสที่เปิดอยู่",
    resolveHold: "ปลดการระงับ",
  },
  finance: {
    title: "การเงิน — การกระทบยอด",
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
} as const;
