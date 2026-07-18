# Content & IA review — page and flow recommendations

**Lens:** Information architecture + content strategy  
**Scope:** Every current web surface and the journeys they support  
**Audience:** Product, design, eng preparing Phase 0 demo → Phase 1 polish  
**Companion:** [`information-architecture.md`](information-architecture.md), [`investor-demo-capabilities.md`](investor-demo-capabilities.md), [`PRD_v1.5.md`](PRD_v1.5.md) §4

This is a **review with recommended changes**, not a rewrite of the PRD. Each finding states the problem, why it matters, and a concrete content/IA fix. Priorities:

| Priority | Meaning |
|---|---|
| **P0** | Blocks trust or demo comprehension in the room |
| **P1** | Strongly improves journey clarity / conversion of the happy path |
| **P2** | Polish, consistency, Phase 1 readiness |

---

## Executive verdict

The product **promise** on the landing page is clear, and role entry via the picker is the right IA for a Phase 0 demo. The weakest content layer is **status language and object identity** on `/clinic` and `/pro`: English enum badges (`AwaitingPayment`, `ServiceCompleted`, `Verified`), truncated IDs, and money-as-title make bookings look like a ledger, not a staffing product. Fix customer-facing status copy and “what is this shift?” first; then tighten nav, empty states, and staff jargon.

---

## Cross-cutting principles (apply everywhere)

1. **Customer status is derived — so labels must be customer language.** Never show raw machine states (`AwaitingPayment`, `PaymentProtected`) to clinics or professionals. Map to Thai phrases that match PRD §6.2 intent (e.g. “รอชำระเงิน”, “ยืนยันแล้ว · คุ้มครองการชำระเงิน”).
2. **Lead with the human object, not the amount.** A shift/booking row’s primary line should be *when · where · who · what*; compensation is secondary metadata.
3. **One job per section; next action visible.** Each list should answer: *what needs me now?* Put actionable items first; archive/history below or filtered.
4. **Empty states need a next step**, not only “ยังไม่มี…”.
5. **Demo vs product voice must not mix on customer surfaces.** Hide eng/PRD IDs (`REP-02`, `§6.4`, `AUTH_DEV_MODE`) from clinic/pro; keep them on staff/eng tools only if needed.
6. **Thai-first, English only for proper nouns / regulated terms.** Prefer one Thai phrase for Payment Protected (e.g. “คุ้มครองการชำระเงิน”) and use the English term once as a gloss if investors need it — not mixed mid-badge.

---

## 1. Global navigation (`AppHeader`)

### What’s wrong
- Nav exposes **Ops · Finance · Flow · Sign in** to everyone, including people who just landed as a clinic/pro.
- **Clinic and Pro are missing** from the header — reachable only via role picker — so after sign-out users lose the mental model of “my workspace.”
- Label **“เดโม”** for `/flow` competes with the real product demo (role picker). Investor checklist already says `/flow` is eng smoke.

### Recommendations
| ID | Priority | Suggestion |
|---|---|---|
| N1 | P0 | **Context-aware nav:** signed-out → Home · เข้าใช้งาน; signed-in clinic → Home · คลินิกของฉัน · ออกจากระบบ; signed-in pro → Home · งานของฉัน · ออกจากระบบ; staff → Home · ปฏิบัติการ / การเงิน as appropriate. Do not show Ops/Finance/Flow to party users. |
| N2 | P1 | Relabel `/flow` in staff/eng nav to **“ทดสอบระบบ”** or **“Smoke”** (or remove from header entirely; keep footer-only). Reserve “เดโม” for the role-picker journey. |
| N3 | P1 | Add **current role / account chip** in the header (name + role) so switching sides in an investor demo is always visible. |
| N4 | P2 | “เข้าใช้งาน” is fine for demo; for Phase 1 rename to **“เข้าสู่ระบบ”** and keep role choice *after* OTP, not as the primary nav metaphor. |

---

## 2. Landing `/`

### What’s working
- Brand-forward hero; promise line; mock checkout visual that proves **Payment Protected**.
- Role picker as primary CTA (correct for Phase 0 investor demo).
- How-it-works in four steps aligned to the promise.

### Content / IA issues
- **Hero has no primary CTA in the first viewport** — picker is below the fold on many phones; `ctaPrimary` / `ctaSecondary` exist in `strings.ts` but are unused.
- Hero **description restates the whole product**; competes with the H1. One short supporting sentence is enough.
- **“เฟส 0 — คอนเซียร์จ…”** as eyebrow is internal roadmap language for investors/ops, not customers.
- Trust line (“ตรวจสอบแล้ว · พร้อมทำงาน · …”) sits *after* how-it-works; it belongs with the promise.
- How-it-works is clinic-centric; professionals don’t see themselves until step 2–4.
- Footer “การสาธิตอัตโนมัติ…” is good demotion of `/flow`, but the word **สาธิต** still sounds like the main demo.

### Recommendations
| ID | Priority | Suggestion |
|---|---|---|
| H1 | P0 | Add hero CTA group: **เริ่มเดโม** (anchor `#start`) + optional **ดูวิธีทำงาน** (`#how`). Use existing `ctaPrimary` / `ctaSecondary`. |
| H2 | P1 | Tighten lead to one line, e.g. “คลินิกจองบุคลากรที่ตรวจสอบแล้ว — เงินถูกคุ้มครองจนกว่าเวรจะเสร็จ.” Move the long paragraph to how-it-works or a later “เกี่ยวกับ” block. |
| H3 | P1 | Replace phase eyebrow with customer-facing signal: **“กรุงเทพฯ และปริมณฑล · แพทย์และทันตแพทย์”** (or hide phase on marketing surface; keep in footer/meta only). |
| H4 | P1 | Move trust-line under the H1/lead (or into the mock card caption). |
| H5 | P2 | Offer a **two-path how-it-works** toggle (มุมคลินิก / มุมบุคลากร) or dual column — same four beats, different subject. |
| H6 | P2 | Footer link copy: **“สำหรับทีมพัฒนา: ทดสอบทั้งขั้นตอนอัตโนมัติ”** — remove “สาธิต” ambiguity. |

**Suggested hero stack (content only):**  
Brand → short location/profession signal → H1 promise → one sentence → CTA → mock Payment Protected card.

---

## 3. Role picker & `/signin`

### What’s working
- One-click accounts with phone + auto OTP — perfect for demo IA.
- Dual finance accounts make dual-control *visible*.
- Reset demo colocated with sign-in is correct.

### Content / IA issues
- **Emoji** on cards (🏥🩺) reads playful vs clinical trust product; also weak a11y.
- Sublabels mix Thai + English role names (`Operations`, `Finance`, `§6.4`).
- Home and `/signin` **duplicate the same picker** with different framing — fine, but titles should clarify *when* to use which.
- No **guided demo order** (“เริ่มที่คลินิก → สลับไปบุคลากร”) on the page — presenters narrate what the UI could teach.
- Reset control lacks consequence copy (what gets wiped).

### Recommendations
| ID | Priority | Suggestion |
|---|---|---|
| R1 | P1 | Replace emoji with role marks / initials / simple icons consistent with the design system. |
| R2 | P0 | Thai-only sublabels; drop `§6.4` from the card — say **“ต้องมีผู้อนุมัติคนที่สอง”**. |
| R3 | P1 | On `/` picker section, add a one-line **suggested path**: “แนะนำ: เริ่มที่คลินิก → สลับไปบุคลากร → ปฏิบัติการ → การเงิน”. |
| R4 | P1 | Group cards: **คู่สัญญา** (clinic, pro) vs **ทีมภายใน** (ops, finance ×2). |
| R5 | P2 | Reset helper: “ล้างข้อมูลเดโมกลับชุดตั้งต้น — การจองและการยืนยันที่ทำไว้จะหาย.” |
| R6 | P2 | `/signin` H1 is clear; add link back: “หรือเริ่มจากหน้าแรก” for orientation. |

---

## 4. Clinic workspace `/clinic`

### What’s working
- Clear three-block IA: **ประกาศเวร → เวรของฉัน → การจอง** matches the happy path.
- Confirm & pay CTA appears only when offer is `AwaitingPayment` — good progressive disclosure.
- Gate when unsigned is short and actionable.

### Content / IA issues (highest impact)
- **Rows are money-first:** primary title is `฿10,000` — not clinic shift identity (date, hours, specialty, location).
- **English enum badges** for offer/booking/payout states break Thai LOC-01 and investor “status in customer language” bar.
- Candidates shown as **`professionalId.slice(0, 6)`** — unreadable; kills trust.
- Post-shift form is **compensation + urgent only** — no schedule, scope, or location fields in the UI (even if API defaults them). Demo feels incomplete vs PRD journey step 3.
- No **checkout preview** before “ยืนยัน & จ่าย” (fee 12%, total) — the landing mock promises this moment; the clinic page doesn’t show it at confirm time.
- Section order dumps all shifts equally; **needs-action** (awaiting payment, awaiting completion) isn’t prioritized.
- Cancel has no **consequence microcopy** (who gets what).
- Clinic review after completion is missing (pro has review CTA; clinic doesn’t).
- Hardcoded inline Thai not in `strings.ts` — harder to keep voice consistent.

### Recommendations
| ID | Priority | Suggestion |
|---|---|---|
| C1 | P0 | **Status dictionary (Thai)** for offer + booking + payout; badge shows Thai only. Keep English in `title` tooltip for staff if needed. |
| C2 | P0 | Row primary: **“เวรอายุรกรรม · 18 ก.ค. 09:00–17:00 · สุขุมวิท”** (or whatever seeded fields exist); compensation as secondary. |
| C3 | P0 | Candidate CTA: **display name + profession + verified badge**, not truncated UUID. |
| C4 | P0 | Before confirm: show **checkout breakdown** (ค่าตอบแทน / ค่าบริการ 12% / รวม) + “หลังจ่าย ระบบจะยืนยันการจองและคุ้มครองเงิน”. |
| C5 | P1 | Split **ต้องดำเนินการ** vs **ทั้งหมด** (or sort actionable first). |
| C6 | P1 | Expand post form minimally for demo honesty: date/time (or “วันนี้ 09:00–17:00” preset chips) + optional note; keep urgent. |
| C7 | P1 | Cancel: confirm dialog — “ยกเลิกการจองที่ยืนยันแล้ว อาจมีค่าธรรมเนียม/คืนเงินตามเงื่อนไข” + reason. |
| C8 | P1 | After `ServiceCompleted` / accepted completion: **รีวิวบุคลากร** CTA (mirror pro). |
| C9 | P2 | Empty shifts: “ยังไม่มีเวร — ประกาศเวรด้านบนเพื่อเริ่มหาบุคลากร”. Empty bookings: “เมื่อบุคลากรยอมรับและคุณจ่ายเงิน การจองจะปรากฏที่นี่”. |
| C10 | P2 | Page subtitle under H1: one line job story — “ประกาศเวร ส่งข้อเสนอหนึ่งฉบับ ยืนยันและคุ้มครองเงิน”. |

**Suggested status map (clinic-facing):**

| Machine state | Thai badge |
|---|---|
| (no offer, has applicants) | มีผู้สมัคร |
| PendingResponse | รอบุคลากรตอบ |
| AwaitingPayment | รอชำระเงิน |
| Converted / booked Confirmed | ยืนยันแล้ว · คุ้มครองการชำระเงิน |
| InProgress | กำลังปฏิบัติงาน |
| AwaitingCompletion | รอรับรองว่าเสร็จ |
| ServiceCompleted | เสร็จสิ้น |
| Cancelled | ยกเลิกแล้ว |
| payout Paid | จ่ายเงินแล้ว |
| payout Held | ระงับการจ่าย |

---

## 5. Professional workspace `/pro`

### What’s working
- Section order **ข้อเสนอ → เวรเปิดรับ → งานของฉัน** matches “respond to money moments first.”
- Accept toast explains soft hold (“รอคลินิกยืนยัน”) — good.
- Arrive → complete → review sequence is visible.

### Content / IA issues
- Same **money-as-title** and **English enums** as clinic.
- Open shifts show `category` only — no clinic name, time, location, verification signal.
- Apply has no confirmation of **non-binding** nature (PRD APP-01) — important trust copy.
- Accept has no **exact terms panel** (compensation, hours, fee note, expiry) before commit.
- No decline CTA (only accept) — incomplete offer IA.
- Arrive + Complete both shown for Confirmed — easy to skip “arrive”; needs sequencing copy or disable complete until arrived.
- Review is **“รีวิว ★5”** only — looks fake; needs score choice + optional comment for credibility.
- No availability section (known Gap) — empty-state should say so if still missing, or add a minimal “เวลาที่รับงาน” block.

### Recommendations
| ID | Priority | Suggestion |
|---|---|---|
| P1a | P0 | Same Thai status dictionary as clinic; emphasize **คุ้มครองการชำระเงิน** once clinic confirms. |
| P2 | P0 | Open shift row: **clinic name (verified) · when · where · pay · urgent**. |
| P3 | P0 | Offer accept: modal/sheet with exact terms + “ยังไม่ใช่การจอง จนกว่าคลินิกจะชำระเงิน”. |
| P4 | P1 | Add **ปฏิเสธ** on pending offers. |
| P5 | P1 | Apply helper: “การสมัครยังไม่ผูกพัน — คลินิกต้องส่งข้อเสนอก่อน”. |
| P6 | P1 | Gate **ส่งงานเสร็จ** until arrived (or single primary “เริ่มงาน” then “ส่งงานเสร็จ”). |
| P7 | P1 | Review: 1–5 + short optional text; label “รีวิวคลินิกหลังเวรเสร็จ”. |
| P8 | P2 | If availability UI absent: quiet note “ในเฟสนี้เวลาว่างตั้งโดยทีมเดโม” *or* ship minimal availability chips. |
| P9 | P2 | Rename “งานของฉัน” subtitle to clarify booking vs applications. |

---

## 6. Operations `/ops`

### What’s working
- Strong staff IA: metrics → pending verify → cases → active bookings.
- Uses shared `PageHeader` / `SectionBlock` / empty states — more mature than party pages.
- Enforcement actions labeled in Thai.

### Content / IA issues
- Page still reads as **console**, not “queue of work.” Pending items likely show IDs/kinds without human summary.
- Case kinds are good Thai, but case states include English-shaped keys (`InProgress` vs domain `UnderReview` / `AwaitingUser`) — align copy to CaseState.
- No **“ขอข้อมูลเพิ่ม” / ปฏิเสธ** path on verify — only approve. Incomplete verification IA vs VER-02.
- Audit trail not surfaced (API exists) — content strategy for trust: “ใครทำอะไร” should be one section or drawer.
- Mix of toast strings hardcoded vs `th.ops.*`.

### Recommendations
| ID | Priority | Suggestion |
|---|---|---|
| O1 | P1 | Pending row template: **ชื่อคลินิก/แพทย์ · ประเภท · วันที่ส่ง · สถานะตรวจสอบ**. |
| O2 | P1 | Verify actions: **ผ่าน / ขอข้อมูลเพิ่ม / ไม่ผ่าน** (even if NeedsInformation is stubbed). |
| O3 | P1 | Add **บันทึกการตรวจสอบ (Audit)** section or per-item history using `GET /ops/audit`. |
| O4 | P2 | Reframe title to queue language: **“คิวปฏิบัติการ”** with subtitle “ตรวจสอบ · เคส · การระงับ”. |
| O5 | P2 | When metrics all zero, explain *why* (“รีเซ็ตเดโม หรือยังไม่มีกิจกรรม”). |
| O6 | P2 | Hold/suspend: require short reason field (content + compliance posture). |

---

## 7. Finance `/finance`

### What’s working
- Reconciliation table + dual-control refund is the right IA for proving Payment Protected money truth.
- Explicit “ต้องมีผู้อนุมัติสองคน” in refund title.

### Content / IA issues
- **`ส่งออก CSV (REP-02)`** — requirement IDs are eng-facing; strip from button label.
- Column **“สมดุล”** for conservation is abstract; consider **“ตรงยอด” / “ไม่ตรงยอด”** with helper “เงินที่เก็บ = จ่ายออก + คืนเงิน + ค่าบริการ…”.
- Booking column shows truncated IDs — pair with clinic/pro names or shift date when available.
- Refund form reason placeholder is thin; no link to booking context (who/when).
- No plain-language **summary sentence** above the table (“เก็บเงินแล้ว X · จ่ายแล้ว Y · ผิดปกติ Z”).
- CSV filename `finance-export.csv` is English-only — fine for finance tools; optional Thai date in name.

### Recommendations
| ID | Priority | Suggestion |
|---|---|---|
| F1 | P0 | Button: **ส่งออก CSV** — move REP-02 to docs/traceability only. |
| F2 | P1 | Summary line in human Thai above stats. |
| F3 | P1 | Conservation helper tooltip / footnote explaining the invariant. |
| F4 | P1 | Refund panel header includes booking identity + max refundable amount in THB. |
| F5 | P2 | Pending approvals: show amount, reason, proposer name, time — approve CTA secondary until scanned. |
| F6 | P2 | Empty reconciliation: “ยังไม่มีคำสั่งชำระเงิน — ให้คลินิกยืนยันการจองในเดโมก่อน”. |

---

## 8. Flow harness `/flow`

### What’s working
- Correctly demoted; English OK for eng harness.
- Step log makes the vertical slice inspectable.

### Content / IA issues
- Still in primary nav as “เดโม” — confuses IA (see N2).
- Step labels are eng system voice (“Registered”, “state=…”); fine for eng, but if anyone demos it, add a banner: **“หน้านี้สำหรับทีมพัฒนา ไม่ใช่เดโมลูกค้า”**.
- Progress “7 steps” vs later payout/review stages — content should match actual phases (book → pay out → review).

### Recommendations
| ID | Priority | Suggestion |
|---|---|---|
| L1 | P0 | Persistent banner: eng-only smoke test; link to role picker for the real demo. |
| L2 | P1 | Remove from default header; footer + direct URL only. |
| L3 | P2 | Two progress phases labeled **Booking** and **Settlement & reviews**. |

---

## 9. Voice & terminology guide (adopt)

| Concept | Prefer (customer Thai) | Avoid on clinic/pro |
|---|---|---|
| Payment Protected | คุ้มครองการชำระเงิน | raw `PaymentProtected`, casual “escrow” |
| Verified | ตรวจสอบแล้ว | `Verified` badge text |
| Offer | ข้อเสนอ (ผูกพัน) | “offer” in badges |
| Soft hold | ยอมรับแล้ว — รอคลินิกชำระเงิน | `AwaitingPayment` alone |
| Booking confirmed | ยืนยันการจองแล้ว | `Confirmed` alone |
| Urgent | ด่วน | `Urgent` English in checkbox label (“ด่วน (Urgent)” → **ด่วน**) |
| Operations | ฝ่ายปฏิบัติการ | “Ops” in party UI |
| Dual control | ต้องมีผู้อนุมัติคนที่สอง | `§6.4`, `dual-control` on cards |
| Requirement IDs | docs only | Buttons, nav, customer toasts |

Centralize clinic/pro copy into `strings.ts` (or `strings/clinic.ts`) the way ops/finance already are.

---

## 10. Journey-level content fixes (by PRD §4)

### Clinic journey
1. Register/verify — **Gap:** add a read-only “สถานะการตรวจสอบ” panel on `/clinic` so verification isn’t invisible.  
2. Profile — out of scope for Phase 0 UI; don’t pretend with empty chrome.  
3. Post/search — improve post form honesty (C6); search/invite remain Gap — empty candidate state should say “ยังไม่มีผู้สมัคร — เชิญบุคลากรหรือรอสมัคร” even before invite ships.  
4–7. Offer → pay → protected — **P0 checkout + Thai status (C1, C4).**  
8. Messaging — Gap; don’t show a dead “ข้อความ” tab until live.  
9–10. Complete + review + money outcome — add review (C8); show payout/refund outcome in Thai on the booking row.

### Professional journey
Mirror the above: terms before accept (P3), Payment Protected visibility after clinic pays, sequenced attendance (P6), real review (P7). Availability: either minimal UI or explicit “managed for demo” note (P8).

### Exception journey
Ops/Finance content is closer; add **reason fields**, **audit visibility**, and party-facing status when a hold/cancel/refund happens (“การจองถูกระงับชั่วคราว — ฝ่ายปฏิบัติการกำลังตรวจสอบ”).

---

## 11. Suggested implementation order

1. **P0 content pack (no new endpoints):** Thai status map; money-secondary rows; candidate/clinic names; checkout summary on confirm; nav context / demote `/flow`; strip REP-02 / § from customer-facing chrome.  
2. **P1 journey clarity:** needs-action sorting; offer decline; apply/accept microcopy; arrive/complete sequencing; verify secondary actions; finance human summary; demo path hint on picker.  
3. **P2 / Phase 1:** availability & invite UI copy, messaging entry, audit section, dual how-it-works, strings centralization for clinic/pro.

---

## 12. Success criteria (content)

You can explain ProBooking in two minutes **using only the UI** when:

- A stranger can say what each badge means without reading the PRD.  
- Clinic confirm shows the same Payment Protected story as the landing mock.  
- Switching clinic ↔ pro never requires an engineer to translate enums or IDs.  
- Ops/Finance prove control without leaking eng requirement codes into buttons.  
- `/flow` cannot be mistaken for the product demo.

---

## Change control

Update this review when a P0/P1 item ships (check it off in a PR) or when PRD journey copy changes. Prefer amending [`information-architecture.md`](information-architecture.md) coverage flags when Gaps close.
