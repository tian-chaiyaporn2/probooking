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
      "เฟส 0 เป็นคอนเซียร์จ ทีม ProBooking ช่วยจองให้ครบวงจร หน้านี้แสดงเส้นทางธุรกรรมและเครื่องมือทีมภายใน ไม่ใช่ตลาดจองด้วยตนเองแบบเต็มรูปแบบ",
    phase: "เฟส 0 คอนเซียร์จ กรุงเทพฯ และปริมณฑล",
    metadataDescription:
      "ตลาดสองด้านสำหรับเวรคลินิกชั่วคราวในประเทศไทย จองบุคลากรที่ตรวจสอบแล้ว พร้อมการชำระเงินที่คุ้มครอง",
    ctaPrimary: "ดูเส้นทางจอง",
    ctaSecondary: "ดูวิธีทำงาน",
    trust: ["ตรวจสอบแล้ว", "พร้อมทำงาน", "จองได้", "คุ้มครองการชำระเงิน"],
    howTitle: "ทำงานอย่างไร",
    howSubtitle: "จากประกาศเวรถึงจ่ายเงิน สี่ขั้นตอนที่ตรวจสอบได้",
    steps: [
      {
        t: "ประกาศเวร",
        d: "คลินิกที่ตรวจสอบแล้วลงเวรที่เปิดรับ พร้อมเงื่อนไขและค่าตอบแทนที่ชัดเจน",
      },
      {
        t: "เชิญและเสนอ",
        d: "บุคลากรสมัครหรือถูกเชิญ คลินิกส่งข้อเสนอผูกพันหนึ่งฉบับ",
      },
      {
        t: "ยืนยันและคุ้มครองเงิน",
        d: "ยอมรับข้อเสนอแล้วกันเงินไว้ (คุ้มครองการชำระเงิน) ก่อนยืนยันการจอง",
      },
      {
        t: "ทำงานและรับเงิน",
        d: "เมื่อเสร็จงาน ระบบจ่ายเงินให้บุคลากรพร้อมบันทึกที่ตรวจสอบได้",
      },
    ],
    audiencesTitle: "คุณคือใคร",
    audiencesSubtitle: "เลือกบทบาทเพื่อดูขั้นตอนถัดไปที่เหมาะกับคุณ",
    audienceClinic: "สำหรับคลินิก",
    audienceClinicDesc:
      "เฟสนี้ทีมคอนเซียร์จช่วยประกาศเวร จอง และยืนยันการชำระเงินให้",
    audiencePro: "สำหรับบุคลากร",
    audienceProDesc:
      "ส่งเอกสารยืนยันตัวตน รับข้อเสนอที่ชัดเจน และติดตามการจ่ายเงิน",
    audienceStaff: "สำหรับทีมภายใน",
    audienceStaffDesc:
      "ปฏิบัติการตรวจสอบและจัดการเคส การเงินกระทบยอดคำสั่งชำระเงิน",
    pickTitle: "เลือกบทบาทเพื่อเริ่มเดโม",
    pickSubtitle:
      "เข้าสู่ระบบด้วยบัญชีทดลองของแต่ละบทบาท แล้วขับเคลื่อนทั้งขั้นตอนด้วยตนเอง คลิกเดียว รหัส OTP กรอกให้อัตโนมัติ",
    flowSmokeNote: "การสาธิตอัตโนมัติแบบคลิกเดียว (สำหรับทีมพัฒนา)",
    surfacesTitle: "เข้าใช้งาน",
    surfacesSubtitle: "เส้นทางจองสำหรับผู้ใช้ เครื่องมือทีม และเดโมสำหรับนักพัฒนา",
    journeyLink: "เส้นทางจอง",
    journeyDesc:
      "เดินทีละขั้นจากข้อเสนอถึงคุ้มครองเงิน เสร็จงาน และจ่ายออก (ภาษาไทย)",
    flowLink: "เดโมสำหรับนักพัฒนา",
    flowDesc: "ฮาร์เนส e2e เดินครบทั้งขั้นตอนอัตโนมัติ (ภาษาอังกฤษ)",
    opsLink: "แดชบอร์ดฝ่ายปฏิบัติการ",
    opsDesc: "ตรวจสอบคลินิกและบุคลากร จัดการเคสและการระงับ",
    financeLink: "การกระทบยอดฝ่ายการเงิน",
    financeDesc: "กระทบยอดคำสั่งชำระเงินและตรวจสอบการอนุรักษ์ยอด",
    open: "เปิด",
    contactNote:
      "สนใจใช้งานจริงในเฟส 0? ติดต่อทีมคอนเซียร์จ เรายังไม่เปิดจองด้วยตนเองสาธารณะ",
  },
  flow: {
    title: "เดโมสำหรับนักพัฒนา",
    subtitle:
      "ฮาร์เนส e2e (ภาษาอังกฤษ): ลงทะเบียนและตรวจสอบ ข้อเสนอ ยอมรับ ยืนยัน จ่ายเงิน รีวิว (ไม่ใช่เส้นทางผู้ใช้จริง)",
    run: "เริ่มขั้นตอนการจอง",
    running: "กำลังเดินขั้นตอน…",
    progress: (done: number, total: number) => `ขั้นตอน ${done} จาก ${total}`,
  },
  journey: {
    title: "เส้นทางจอง",
    subtitle:
      "จำลองเส้นทางจริงทีละขั้น: ข้อเสนอผูกพัน → ยอมรับ → คุ้มครองการชำระเงิน → สถานะการจอง → เสร็จงานและจ่ายเงิน",
    start: "เริ่มเส้นทาง",
    starting: "กำลังเตรียมคลินิกและบุคลากร…",
    perspective: "มุมมอง",
    perspectiveClinic: "คลินิก",
    perspectivePro: "บุคลากร",
    steps: {
      setup: "เตรียมบัญชี",
      offer: "ส่งข้อเสนอ",
      accept: "ยอมรับข้อเสนอ",
      confirm: "ยืนยันและคุ้มครองเงิน",
      complete: "เสร็จงาน",
      payout: "จ่ายเงิน",
    },
    stepDetail: {
      setup: "ลงทะเบียนและให้ฝ่ายปฏิบัติการตรวจสอบคลินิกกับบุคลากร",
      offer: "คลินิกส่งข้อเสนอผูกพันหนึ่งฉบับพร้อมค่าตอบแทนและค่าบริการ",
      accept: "บุคลากรตรวจเงื่อนไขแล้วยอมรับ (กันเงินไว้ แต่ยังไม่ใช่การจอง)",
      confirm: "คลินิกยืนยันหลังคุ้มครองเงิน → การจองได้รับการยืนยัน",
      complete: "บุคลากรแจ้งเสร็จงาน",
      payout: "คลินิกรับรอง → จ่ายค่าตอบแทนให้บุคลากร",
    },
    actions: {
      setup: "ลงทะเบียนและตรวจสอบ",
      offer: "ส่งข้อเสนอ",
      accept: "ยอมรับข้อเสนอ",
      confirm: "ยืนยันการจอง",
      complete: "แจ้งเสร็จงาน",
      payout: "รับรองและจ่ายเงิน",
      next: "ขั้นตอนถัดไป",
      reset: "เริ่มใหม่",
    },
    timelineCaption: "สถานะเส้นทางจอง",
    bookingId: "รหัสการจอง",
    doneTitle: "เส้นทางครบแล้ว",
    doneBody:
      "การจองได้รับการคุ้มครอง เสร็จงาน และจ่ายเงินแล้ว นี่คือแกนของเฟส 1",
    actingAs: (who: string) => `กำลังดำเนินการในนาม${who}`,
  },
  checkout: {
    caption: "สรุปค่าใช้จ่าย",
    compensation: "ค่าตอบแทน",
    serviceFee: "ค่าบริการ 12%",
    tax: "ภาษี",
    total: "รวม",
    paymentProtected: "คุ้มครองการชำระเงิน",
  },
  common: {
    refresh: "รีเฟรช",
    none: "ไม่มี",
    emptyTable: "ยังไม่มีรายการ",
    loading: "กำลังโหลด…",
    cancel: "ยกเลิก",
    confirm: "ยืนยัน",
    details: "รายละเอียด",
    hideDetails: "ซ่อนรายละเอียด",
    showAll: "แสดงทั้งหมด",
    exceptionsOnly: "เฉพาะรายการผิดปกติ",
  },
  nav: {
    home: "หน้าแรก",
    journey: "เส้นทางจอง",
    ops: "ปฏิบัติการ",
    finance: "การเงิน",
    flow: "เดโม",
    signin: "เข้าใช้งาน",
    publicGroup: "สาธารณะ",
    staffGroup: "ทีมภายใน",
  },
  ops: {
    title: "แดชบอร์ดฝ่ายปฏิบัติการ",
    subtitle: "ตรวจสอบคลินิกและบุคลากร จัดการเคส และการระงับคุณสมบัติ",
    emptyPending: "คิวว่าง ไม่มีรายการรอตรวจสอบ",
    emptyPendingHint: "เมื่อมีคลินิกหรือบุคลากรส่งเอกสาร รายการจะปรากฏที่นี่",
    emptyCases: "ไม่มีเคสที่เปิดอยู่ตอนนี้",
    emptyCasesHint: "เคสระงับคุณสมบัติหรือข้อยกเว้นจะแสดงเมื่อระบบเปิดเคส",
    metricShifts: "เวร (เปิดรับ)",
    metricBookings: "การจอง",
    metricCompleted: "เสร็จสิ้น",
    metricHeld: "ระงับไว้",
    metricCases: "เคสที่เปิด",
    metricExceptions: "รายการกระทบยอดผิดปกติ",
    pending: "รอการตรวจสอบ",
    openSuffix: "เปิดรับ",
    kind: {
      clinic: "คลินิก",
      professional: "บุคลากร",
      insurance: "ประกันภัย",
    } as Record<string, string>,
    caseKind: {
      credential_hold: "ระงับคุณสมบัติ",
      completion_review: "ตรวจหลังเสร็จงาน",
      cancellation_support: "สนับสนุนการยกเลิก",
    } as Record<string, string>,
    caseHint: {
      credential_hold: "ตรวจหลักฐานแล้วปลดการระงับเมื่อยืนยันได้",
      completion_review: "รอการตัดสินจากฝ่ายปฏิบัติการหลังเสร็จงาน",
      cancellation_support: "สนับสนุนการยกเลิก บันทึกการตัดสินในระบบ",
    } as Record<string, string>,
    caseState: {
      Open: "เปิด",
      InProgress: "กำลังดำเนินการ",
      AwaitingUser: "รอผู้ใช้",
      UnderReview: "กำลังตรวจสอบ",
      Resolved: "ปิดแล้ว",
      Reopened: "เปิดใหม่",
    } as Record<string, string>,
    verify: "ตรวจสอบ",
    verifyConfirmTitle: "ยืนยันการตรวจสอบ",
    verifyConfirmBody: (name: string, kind: string) =>
      `ตรวจสอบ「${name}」(${kind}) แล้วเปลี่ยนสถานะเป็นตรวจสอบแล้ว การกระทำนี้ผูกพัน`,
    openCases: "เคสที่เปิดอยู่",
    resolveHold: "ปลดการระงับ",
    resolveConfirmTitle: "ยืนยันการปลดการระงับ",
    resolveConfirmBody: (subject: string) =>
      `ปลดการระงับคุณสมบัติสำหรับ「${subject || "การจองนี้"}」? การจองจะกลับสู่สถานะที่ดำเนินการต่อได้`,
    licence: "เลขใบอนุญาต",
    address: "ที่อยู่",
    profession: "วิชาชีพ",
    entityId: "รหัส",
    activeBookings: "การจองที่กำลังดำเนินอยู่",
    emptyActive: "ไม่มีการจองที่กำลังดำเนินอยู่",
    holdCredential: "ระงับคุณสมบัติ",
    suspend: "ระงับใบอนุญาต",
    heldBadge: "ระงับไว้",
    suspendedBadge: "ระงับแล้ว",
    insuranceVerified: "ตรวจสอบประกันภัยแล้ว",
    credentialSuspended: "ระงับใบอนุญาตแล้ว",
    credentialHeld: "ระงับการจองแล้ว",
  },
  finance: {
    title: "การกระทบยอดการเงิน",
    subtitle: "กระทบยอดคำสั่งชำระเงินกับเงินที่เก็บแล้ว และตรวจการอนุรักษ์ยอด",
    exportCsv: "ส่งออก CSV",
    reconciliation: "รายการกระทบยอด",
    paymentOrders: "คำสั่งชำระเงิน",
    captured: "เก็บเงินแล้ว",
    payouts: "จ่ายออก",
    refunds: "คืนเงิน",
    exceptions: "รายการผิดปกติ",
    colBooking: "การจอง",
    colOrder: "คำสั่งชำระเงิน",
    colUndistributed: "ยังไม่กระจาย",
    colConserved: "สมดุล",
    conservedYes: "สมดุล",
    conservedNo: "ผิดปกติ",
    showing: (shown: number, total: number) =>
      `แสดง ${shown} จาก ${total} รายการ`,
    emptyHint: "เมื่อมีการจองและเก็บเงิน รายการกระทบยอดจะปรากฏที่นี่",
    legsTitle: "องค์ประกอบเงิน",
    filterAll: "ทั้งหมด",
    filterExceptions: "ผิดปกติเท่านั้น",
    refund: "คืนเงิน",
    refundTitle: "คืนเงิน (ต้องมีผู้อนุมัติสองคน)",
    refundAmount: "จำนวนเงิน (บาท)",
    refundAmountInvalid: "กรุณากรอกจำนวนเงินที่มากกว่าศูนย์",
    refundReason: "เหตุผล",
    refundReasonPlaceholder: "เช่น คืนเงินตามดุลยพินิจ",
    propose: "เสนอคืนเงิน",
    cancel: "ยกเลิก",
    pendingApprovals: "รออนุมัติคืนเงิน",
    approve: "อนุมัติ & คืนเงิน",
    emptyApprovals: "ไม่มีรายการรออนุมัติ",
    proposedBy: "เสนอโดย",
    refundProposed: "บันทึกคำขอคืนเงินแล้ว รอผู้อนุมัติคนที่สอง",
    refundApproved: "อนุมัติและคืนเงินแล้ว",
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
    signIn: "เข้าสู่ระบบ",
    requestNewCode: "กลับไปขอรหัสใหม่",
    sendCodeError: "ส่งรหัส OTP ไม่สำเร็จ กรุณาลองอีกครั้ง",
    signInError: "เข้าสู่ระบบไม่สำเร็จ กรุณาตรวจสอบรหัส OTP แล้วลองอีกครั้ง",
    signOut: "ออกจากระบบ",
    sessionExpiredBanner: "เซสชันหมดอายุ กรุณาเข้าสู่ระบบอีกครั้ง",
    demoHint: "เดโม: ใช้บัญชีทดลองด้านล่าง (รหัส OTP กรอกให้อัตโนมัติ)",
    useDemo: "เข้าสู่ระบบด้วยบัญชีทดลอง",
  },
  a11y: {
    primaryNav: "เมนูหลัก",
    openMenu: "เปิดเมนู",
    closeMenu: "ปิดเมนู",
    closeDialog: "ปิดกล่องโต้ตอบ",
    notifications: "การแจ้งเตือน",
    dismissNotification: "ปิดการแจ้งเตือน",
    switchToLight: "เปลี่ยนเป็นโหมดสว่าง",
    switchToDark: "เปลี่ยนเป็นโหมดมืด",
    lightMode: "โหมดสว่าง",
    darkMode: "โหมดมืด",
    skipToContent: "ข้ามไปยังเนื้อหา",
    reconciliationTable: "ตารางกระทบยอดคำสั่งชำระเงิน",
    expandRow: "ขยายแถว",
    collapseRow: "ยุบแถว",
  },
  notFound: {
    title: "ไม่พบหน้านี้",
    description: "ลิงก์นี้อาจหมดอายุ หรือหน้าที่ต้องการย้ายไปแล้ว",
    home: "กลับหน้าแรก",
  },
  errors: {
    generic: "เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง",
    connection: "เชื่อมต่อระบบไม่สำเร็จ กรุณาลองอีกครั้ง",
    noPermission: "บัญชีนี้ไม่มีสิทธิ์เข้าถึงหน้านี้",
    sessionExpired: "เซสชันหมดอายุ กรุณารีเฟรชหน้าแล้วเข้าสู่ระบบอีกครั้ง",
    tooManyRequests: "ส่งคำขอถี่เกินไป กรุณารอสักครู่แล้วลองอีกครั้ง",
    phoneRequired: "กรุณากรอกหมายเลขโทรศัพท์",
    invalidOtp:
      "รหัส OTP ไม่ถูกต้องหรือหมดอายุแล้ว กรุณาลองอีกครั้งหรือขอรหัสใหม่",
  },
  status: {
    // Offer
    PendingResponse: "รอตอบรับ",
    AwaitingPayment: "รอชำระเงิน",
    Accepted: "ยอมรับแล้ว",
<<<<<<< HEAD
    Converted: "แปลงเป็นจองแล้ว",
=======
    Converted: "จองแล้ว",
    Withdrawn: "ถอนข้อเสนอแล้ว",
    PaymentFailed: "ชำระเงินไม่สำเร็จ",
>>>>>>> origin/master
    Expired: "หมดอายุ",
    Declined: "ปฏิเสธ",
    Withdrawn: "ถอนแล้ว",
    PaymentFailed: "ชำระเงินไม่สำเร็จ",
    // Booking
    Confirmed: "ยืนยันแล้ว คุ้มครองเงิน",
    InProgress: "กำลังทำงาน",
    AwaitingCompletion: "รอรับรองเสร็จงาน",
    ServiceCompleted: "เสร็จงานแล้ว",
    Cancelled: "ยกเลิก",
    Archived: "เก็บถาวร",
    // Payout
    NotEligible: "ยังไม่ถึงกำหนดจ่าย",
    Pending: "รอจ่าย",
    Processing: "กำลังดำเนินการจ่าย",
    Paid: "จ่ายแล้ว",
<<<<<<< HEAD
    NotEligible: "ยังไม่ถึงกำหนดจ่าย",
    Processing: "กำลังจ่าย",
    Failed: "จ่ายไม่สำเร็จ",
    Held: "ระงับการจ่าย",
    Reversed: "คืนรายการแล้ว",
=======
    Failed: "จ่ายไม่สำเร็จ",
    Held: "ระงับการจ่าย",
    Reversed: "เรียกคืนแล้ว",
>>>>>>> origin/master
    // Shift / misc
    Open: "เปิดรับ",
    Filled: "เต็มแล้ว",
    // Verification (VER)
    Draft: "ร่าง",
    Submitted: "ส่งแล้ว",
    UnderReview: "กำลังตรวจสอบ",
    NeedsInformation: "ต้องการข้อมูลเพิ่ม",
    Verified: "ตรวจสอบแล้ว",
    Rejected: "ไม่ผ่าน",
    Suspended: "ระงับ",
    Closed: "ปิดแล้ว",
  } as Record<string, string>,
  /** Medical shift categories (SRC). Falls back to the raw value if unmapped. */
  category: {
    general: "เวชปฏิบัติทั่วไป",
    dentistry: "ทันตกรรม",
    nursing: "การพยาบาล",
  } as Record<string, string>,
  /** Professional titles. Falls back to the raw value if unmapped. */
  profession: {
    physician: "แพทย์",
    dentist: "ทันตแพทย์",
    nurse: "พยาบาล",
  } as Record<string, string>,
  nextAction: {
    PendingResponse: "บุคลากร: ตรวจค่าตอบแทนและค่ายบริการ แล้วยอมรับข้อเสนอ",
    AwaitingPayment:
      "คลินิก: ยืนยันและกันเงิน (คุ้มครองการชำระเงิน) เพื่อสร้างการจอง",
    Confirmed: "บุคลากร: มาถึงและทำงานตามเวร",
    InProgress: "บุคลากร: ส่งงานเสร็จเมื่อทำงานครบ",
    AwaitingCompletion: "คลินิก: รับรองเสร็จงานเพื่อจ่ายเงิน",
    ServiceCompleted: "ทั้งสองฝ่าย: รีวิวได้หลังเสร็จงาน",
  } as Record<string, string>,
  party: {
    switchRole: "เปลี่ยนบทบาท",
    signInPromptClinic: "เข้าสู่ระบบเป็นเจ้าของคลินิกเพื่อจัดการเวร",
    signInPromptPro: "เข้าสู่ระบบเป็นบุคลากรเพื่อหาเวรและรับงาน",
    pickAccount: "เลือกบัญชีเข้าสู่ระบบ",
    postShift: "ประกาศเวรใหม่",
    compensationBaht: "ค่าตอบแทน (บาท)",
    urgent: "ด่วน (Urgent)",
    myShifts: "เวรของฉัน",
    noShifts: "ยังไม่มีเวร ประกาศเวรด้านบน",
    candidates: "ผู้สมัคร",
    sendOffer: "ส่งข้อเสนอ",
    confirmPay: "ยืนยัน & กันเงิน",
    myBookings: "การจอง",
    noBookings: "ยังไม่มีการจอง",
    acceptPayout: "รับงาน & จ่ายเงิน",
    cancel: "ยกเลิก",
    cancelConfirmTitle: "ยืนยันการยกเลิก",
    cancelConfirmBody: "ยกเลิกการจองนี้? ตามนโยบายอาจมีผลต่อค่าตอบแทน",
    offersToMe: "ข้อเสนอถึงฉัน",
    noOffers: "ยังไม่มีข้อเสนอ สมัครเวรด้านล่างก่อน",
    acceptOffer: "ยอมรับ",
    declineOffer: "ปฏิเสธ",
    openShifts: "เวรที่เปิดรับ",
    noOpenShifts: "ยังไม่มีเวรเปิดรับ",
    apply: "สมัคร",
    myJobs: "งานของฉัน",
    noJobs: "ยังไม่มีงาน",
    arrive: "มาถึงแล้ว",
    complete: "ส่งงานเสร็จ",
    review: "รีวิว ★5",
    payoutLabel: "จ่ายออก",
    holdConfirmTitle: "ยืนยันการระงับการจอง",
    holdConfirmBody: "ระงับคุณสมบัติของการจองนี้จนกว่าฝ่ายปฏิบัติการจะปลด?",
    suspendConfirmTitle: "ยืนยันการระงับใบอนุญาต",
    suspendConfirmBody: (name: string) =>
      `ระงับใบอนุญาตของ「${name}」? การจองใหม่จะถูกบล็อก`,
    profileTitle: "โปรไฟล์",
    identityVerified: "ยืนยันตัวตนแล้ว",
    identityPending: "รอยืนยันตัวตน",
    licence: "ใบอนุญาต",
    insurance: "ประกันภัย",
    ratingColdStart: "ยังไม่มีคะแนนรีวิว",
    filterCategory: "หมวด",
    filterUrgency: "ความด่วน",
    filterMinBaht: "ค่าตอบแทนขั้นต่ำ (บาท)",
    filterApply: "กรอง",
    filterClear: "ล้าง",
    urgencyAll: "ทั้งหมด",
    urgencyUrgent: "ด่วน",
    urgencyStandard: "ปกติ",
    searchPros: "ค้นหาบุคลากร",
    searchProfession: "วิชาชีพ",
    searchGo: "ค้นหา",
    searchIdle: "ค้นหาบุคลากรด้วยวิชาชีพด้านบน",
    noProsFound: "ไม่พบบุคลากรที่ตรงเงื่อนไข",
    profileLoadFailed: "โหลดโปรไฟล์ไม่สำเร็จ — ลองรีเฟรชหน้า",
    showThread: "ข้อความ",
    hideThread: "ซ่อนข้อความ",
    noMessages: "ยังไม่มีข้อความ",
    messageHint:
      "ข้อความธรรมดาเท่านั้น ห้ามใส่รหัสผู้ป่วย / HN / เลขบัตร",
    messagePlaceholder: "พิมพ์ข้อความถึงคู่สัญญา…",
    messageSoftWarn: "พบข้อมูลที่อาจเป็นรหัสผู้ป่วย ลบออกก่อนส่ง",
    messageBlocked: "ส่งข้อความไม่สำเร็จ ตรวจสอบว่าไม่มีรหัสผู้ป่วย",
    sendMessage: "ส่ง",
    contactReveal: "ติดต่อหลังยืนยัน",
    clinicPhone: "คลินิก",
    proPhone: "บุคลากร",
    you: "คุณ",
    navClinic: "คลินิกของฉัน",
    navPro: "เวรของฉัน",
  },
} as const;

/**
 * Map a raw API/network error to friendly Thai copy (from PR #9). Pairs with `errorFrom`
 * in lib/api, which already extracts the server's message; this turns that (or a network
 * failure) into a sentence the user reads, falling back to the caller's default.
 */
export function getThaiErrorMessage(
  error: unknown,
  fallback: string = th.errors.generic,
): string {
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  // API: "too many OTP requests; retry later" match before/after errorFrom stripping.
  if (
    message.includes("too many requests") ||
    message.includes("too many otp") ||
    message.includes("retry later") ||
    message.startsWith("429:")
  ) {
    return th.errors.tooManyRequests;
  }
  if (message.includes("invalid or expired code")) return th.errors.invalidOtp;
  if (message.includes("phone required")) return th.errors.phoneRequired;
  if (
    message.includes("requires role") ||
    message.includes("not a member") ||
    message.includes("forbidden") ||
    message.startsWith("403:")
  ) {
    return th.errors.noPermission;
  }
  if (
    message.includes("authentication required") ||
    message.startsWith("401:")
  ) {
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
