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
    steps: "ขั้นตอน",
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
