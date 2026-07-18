# ProBooking — UX / UI States Review

**Date:** 2026-07-18  
**Scope:** All interactive flows and surfaces — initial, empty, loading, error, success, validation, session, and edge states  
**Surfaces:** `/`, `/signin`, `/clinic`, `/pro`, `/ops`, `/finance`, `/journey`, `/flow`, route `error` / `not-found`, shared primitives  
**Method:** Code review of App Router pages, state UI components, Thai copy, domain state machines, and CSS  
**Complements:** [`UX_Review.md`](./UX_Review.md), [`UX_Review_Followup.md`](./UX_Review_Followup.md), [`Mobile_Tablet_UI_Review.md`](./Mobile_Tablet_UI_Review.md)

> **Remediation (same PR):** Findings **S1–S14** below are implemented in-code —
> Clinic/Pro loading skeletons + per-action `busyId`, search idle copy,
> verification badge tones + VER Thai labels, Ops `statusLabel` + active skeletons,
> Finance table skeletons + refund field error, Pro offers list aligned to pending,
> soft-warn styling, Journey/Flow Thai errors, sign-in reset `Button`, profile-load notice,
> party `EmptyState` adoption.
>
> **Post-#51:** Landing / role-aware nav / grouped RolePicker are owned by marketing UX #51.
> State remediations on clinic/pro/ops/finance remain the focus of this PR.

---

## Verdict

Staff surfaces (Ops / Finance) have a coherent state system: boot → auth → skeletons → empty → busy → toast / dialog. Party surfaces (Clinic / Pro) and several shared primitives still **confuse loading with empty**, under-signal verification risk, and apply busy/feedback too coarsely. The design system has the right building blocks (`EmptyState`, `Skeleton`, `DataTable`, `Toast`, `Dialog`); adoption is uneven.

| Audience | State UX maturity | Notes |
|---|---|---|
| Landing / sign-in | Medium–High | Clear initial + RolePicker busy/error; reset lacks busy spinner |
| Clinic / Pro | Medium | Happy-path actions work; **false empty on boot**, coarse busy, weak verification tone |
| Messaging thread | Medium–High | Soft-warn + empty + send busy; loading is plain text |
| Ops | High (with gaps) | Best empty/loading pattern; active bookings skip skeletons; English state badge |
| Finance | Medium–High | Stats skeletons good; table loading misuses EmptyState; silent refund validation |
| Journey / Flow | Medium | Progress bars solid; errors can leak English Nest messages |
| Global shell | Medium–High | Branded 404 + route error; no offline / `loading.tsx` / `global-error` |

---

## 1. State primitives inventory

| Primitive | Path | Used well | Gaps |
|---|---|---|---|
| `EmptyState` | `components/EmptyState.tsx` | Ops pending/cases/active; Finance empty | Clinic/Pro use plain `<li className="empty">` (no icon/hierarchy) |
| `Skeleton` / `StatSkeletonGrid` | `components/Skeleton.tsx` | Ops metrics + queues; Finance summary | Clinic/Pro never; Ops active bookings never; Finance table never |
| `DataTable` | `components/DataTable.tsx` | Built with loading rows + empty | **Unused** — Finance reimplements table with weaker loading |
| `Toast` | `components/Toast.tsx` | Success + error across app | No info/warning kinds; Journey/Flow bypass Thai mapper |
| `Dialog` | `components/Dialog.tsx` | Cancel, verify, hold, suspend, refund | Refund confirm can no-op with no field error |
| `Button` `busy` | `components/Button.tsx` | Per-control spinner | Clinic/Pro share one `busy` across **all** actions |
| `Field` error | `components/Field.tsx` | StaffLogin OTP | Refund amount has no error prop wired |
| `StaffLogin` | `components/StaffLogin.tsx` | Phone→OTP, role gate, session notice | — |
| Route `error.tsx` | `app/error.tsx` | Thai recovery + retry | No `global-error.tsx` |
| Route `not-found.tsx` | `app/not-found.tsx` | Branded 404 | — |
| Route `loading.tsx` | — | — | **Missing** on all routes |

---

## 2. Per-flow state matrix

Legend: **Y** present · **P** partial / inconsistent · **N** missing · **Bug** wrong signal

### 2.1 Auth & session

| State | RolePicker | StaffLogin | Clinic / Pro |
|---|---|---|---|
| Initial (signed out) | Y | Y | Y (prompt + link) |
| Loading / busy | Y (card disabled + “…”) | Y (`busy` buttons) | **N** after token — shell paints immediately |
| Success | Y (navigate) | Y (`onToken`) | Y (hydrate `me`) |
| Error | Y (Thai toast) | Y (inline `form-error`) | Y (toast on `getMe` fail) |
| Validation / disabled | Y | Y (empty phone; OTP &lt;6) | — |
| Wrong role / 403 | P (toast) | Y (role gate) | **N** — any token shows workspace shell |
| Session expired | N | Y (`sessionNotice` + clear on 401/403) | **N** — no auto-expire; sign-out is local-only |
| Rate limit (429) | Y | Y | — |
| Offline | P (connection toast) | P | P |

### 2.2 Clinic workspace (`/clinic`)

| Surface | Initial | Empty | Loading | Error | Success | Notes |
|---|---|---|---|---|---|---|
| Unsigned | Sign-in prompt | — | — | — | — | Good |
| Boot (token set, `me` pending) | Fallback title “คลินิก” | **Bug:** shifts/bookings show empty copy | **N** | toast | — | False empty |
| Post shift | Defaults | — | busy btn | toast | toast + reload | Comp ≤0 disables |
| Fee preview | Hidden until comp &gt;0 | — | — | — | CheckoutSummary | Good progressive reveal |
| Search pros | Empty input | **Bug:** “ไม่พบบุคลากร…” before any search | `searchBusy` | toast | results | Pre-search empty reads as failed search |
| Shifts list | — | Y (plain text) | **N** | toast | — | No skeleton; no `EmptyState` |
| Candidates / offer | — | omit actions when 0 | global `busy` | toast | toast | Candidate fetch failure → empty list silently |
| Confirm + pay | — | — | global `busy` | toast | toast | CheckoutSummary when `AwaitingPayment` |
| Bookings | — | Y | **N** | toast | — | Thread nested per row |
| Cancel | Dialog closed | — | Dialog `busy` | toast | toast + close | Good destructive confirm |
| Verification badge | — | — | — | — | — | **Bug:** always `tone="success"` |

### 2.3 Professional workspace (`/pro`)

| Surface | Initial | Empty | Loading | Error | Success | Notes |
|---|---|---|---|---|---|---|
| Unsigned | Sign-in prompt | — | — | — | — | Good |
| Boot | Fallback “บุคลากร” | **Bug:** false empty lists | **N** | toast | — | Same as clinic |
| Profile | — | **Silent omit** if profile fetch fails | **N** | swallowed | panel | No “profile unavailable” |
| Offers | — | Y when `offers.length===0` | **N** | toast | toast | **Bug:** heading counts `pendingOffers` but list shows all offers |
| Filters / browse | Defaults | Y | busy on apply | toast | — | Filter hint from API shown |
| Jobs | — | Y | **N** | toast | toast | Arrive / complete / review |
| Review | — | — | busy | toast | toast | Score hardcoded ★5 — no rating UI states |
| Verification badge | — | — | — | — | — | **Bug:** always `tone="success"` |

### 2.4 Booking thread

| State | Present? | Quality |
|---|---|---|
| Collapsed default | Y | Good |
| Loading on open | Y | Plain muted text — not Skeleton |
| Empty messages | Y | Plain `<li className="empty">` |
| Soft-warn (patient data) | Y | Send disabled; uses `form-error` (danger look) for a soft warning — **visual mismatch** |
| Send busy / disabled | Y | Good |
| Contact reveal | Y | When phones exist |
| Error | Y | Thai toast |

### 2.5 Ops (`/ops`)

| State | Present? | Quality |
|---|---|---|
| Booting | Y | Text “กำลังโหลด…” (could be skeleton) |
| Unauthenticated | Y | StaffLogin |
| Metrics loading | Y | `StatSkeletonGrid` |
| Pending / cases loading | Y | Row skeletons |
| Pending / cases empty | Y | `EmptyState` + hints — best-in-app |
| Active bookings loading | **N** | Empty only when `!loading` — blank card while loading |
| Active booking state label | **Bug** | Raw English `b.state` — not `statusLabel()` |
| Load error | Y | Inline alert + toast; 401/403 expire |
| Action busy | Y | Per-row `busyId` (better than clinic/pro) |
| Confirm dialogs | Y | Verify / resolve / hold / suspend |

### 2.6 Finance (`/finance`)

| State | Present? | Quality |
|---|---|---|
| Boot / auth / expire | Y | Same pattern as Ops |
| Summary loading | Y | `StatSkeletonGrid` |
| Table loading | **P** | `EmptyState` titled “กำลังโหลด…” — looks like empty, not loading |
| Recon empty | Y | Good hint copy |
| Filter exceptions | Y | May empty the visible set — correct empty |
| Pending approvals empty | Y | Check icon EmptyState |
| Refund dialog validation | **Bug** | Amount ≤0 → silent `return`; no field error, button still clickable |
| Export busy | Y | Good |
| Dual-control 403 | Y | Thai toast via mapper |

### 2.7 Journey / Flow / Landing / Global

| Flow | Initial | Progress | Success | Error | Notes |
|---|---|---|---|---|---|
| Landing | Hero + RolePicker | RolePicker busy | Navigate | Toast | Phase eyebrow honest |
| Sign-in | RolePicker + reset | Reset text “…”, no spinner | Toast | Toast | Reset uses raw `<button>` |
| Journey | Timeline preview | Step busy | Done | **Raw English** possible | Bypass `getThaiErrorMessage` |
| Flow | Preview list | Determinate + pulse bar | Logs | **Raw English** possible | Intentional e2e English mixed in |
| 404 | Branded | — | Home CTA | — | Good |
| Render error | Thai + retry | — | reset() | — | No `global-error` |

---

## 3. Findings (UX + UI + visual)

Severity: **P0** trust / false signal · **P1** daily friction · **P2** polish / consistency

### S1 — Clinic/Pro false empty on first paint · **P0**

**What:** After sign-in, token is set immediately and lists default to `[]`, so “ยังไม่มีเวร” / “ยังไม่มีข้อเสนอ” appear until `getMe` + list fetches finish.

**Why it matters:** Empty and loading are opposite messages. Users (and demos) momentarily believe the account has no data.

**Fix:** Track `booting` / `loading` per section; show `Skeleton` or `EmptyState` only when `!loading && length === 0`. Mirror Ops pending queue pattern.

---

### S2 — Search “no results” before any search · **P0** (visual / copy)

**What:** Clinic search always renders `th.party.noProsFound` when `searchHits.length === 0`, including the initial state.

**Why it matters:** Looks like a failed search on first view.

**Fix:** Distinguish `idle` vs `searched-empty` vs `results` (e.g. “ค้นหาบุคลากรด้วยวิชาชีพ” until first submit).

---

### S3 — Verification badges always success green · **P0** (trust)

**What:** Clinic and Pro headers use `<Badge tone="success">` for any `verification` / `professionalVerification` value. Domain includes `NeedsInformation`, `Rejected`, `Suspended`, `UnderReview`, etc. Thai labels for most of those states are also missing from `th.status`, so non-Verified values may show English.

**Why it matters:** A suspended or pending party still looks “green / verified.”

**Fix:** Map verification → tone (`Verified` → success, `NeedsInformation`/`UnderReview` → warning, `Rejected`/`Suspended` → danger, else muted) and complete `th.status` for VER states.

---

### S4 — Ops active booking state in English · **P1** (visual / i18n)

**What:** `<Badge tone="info">{b.state}</Badge>` prints machine English (`Confirmed`, `InProgress`, …). Party pages correctly use `statusLabel()`.

**Fix:** `statusLabel(b.state)` (and prefer warning/danger tones when held/suspended already shown).

---

### S5 — Global `busy` freezes every Clinic/Pro action · **P1**

**What:** One `busy` boolean drives `busy={busy}` on post, offer, confirm, cancel, accept, decline, arrive, complete, review.

**Why it matters:** Unrelated buttons all show spinners; parallel rows feel broken.

**Fix:** Per-id busy like Ops `busyId` (or per-action key).

---

### S6 — Finance table loading looks like empty · **P1** (visual)

**What:** Loading uses `<EmptyState title={th.common.loading} />` inside the table. Same visual language as true empty.

**Fix:** Use `DataTable`’s skeleton rows (component already exists) or row `Skeleton` lines.

---

### S7 — Refund amount validation is silent · **P1**

**What:** `submitRefund` returns early when amount ≤0 with no toast, field error, or disabled confirm.

**Fix:** Disable confirm until valid, or set `Field` `error` + keep dialog open.

---

### S8 — Pro offers count vs list mismatch · **P1**

**What:** Heading uses `pendingOffers.length`; list maps **all** `offers`. After accept/decline, count can be `0` while historical rows still show — or empty copy never appears while non-pending offers remain.

**Fix:** Either filter the list to pending, or change the heading/count to total and split “รอตอบรับ” vs history.

---

### S9 — Soft-warn styled as hard error · **P2** (visual)

**What:** Thread soft-warn uses `className="form-error"` (danger background). It is a preventive tip, not a failed submit.

**Fix:** Warning tone class (or `form-error--info` / new `form-warn`) consistent with Badge warning tokens.

---

### S10 — Party empty states bypass `EmptyState` · **P2** (UI consistency)

**What:** Ops/Finance empty rows have icon + title + optional hint. Clinic/Pro use bare muted text in `<li className="empty">`.

**Fix:** Reuse `EmptyState as="li"` with short hints (already in copy for several cases).

---

### S11 — Journey/Flow errors can show Nest English · **P2**

**What:** `toast.error(e instanceof Error ? e.message : …)` skips `getThaiErrorMessage`.

**Fix:** Same mapper as the rest of the app (Flow may keep English result logs; toasts should still be Thai for demo audiences).

---

### S12 — Missing product/domain states in UI · **P2** (Phase 0 honesty)

No customer-facing UI for: offline banner, PaymentFailed, NeedsInformation/Rejected recovery, Draft/Paused shifts, invitations, availability calendar, self-serve registration (only `/flow` + `/journey`), warning toasts, route-level `loading.tsx`.

Acceptable for Phase 0 concierge — document as known gaps so demos don’t imply they exist.

---

### S13 — Sign-in reset busy is text-only · **P2**

**What:** Reset uses a raw `<button>` with “กำลังรีเซ็ต…” instead of `Button busy` spinner used elsewhere.

**Fix:** Use shared `Button` for visual consistency.

---

### S14 — Profile failure is invisible · **P2**

**What:** Pro `getProfessionalProfile` failure sets `null` and omits `ProfilePanel` with no message.

**Fix:** Compact inline notice (“โหลดโปรไฟล์ไม่สำเร็จ”) + retry.

---

## 4. What’s working well

1. **Ops queue empty states** — clear “queue clear” messaging with hints; builds trust in a low-volume Phase 0.
2. **Staff session expiry** — 401/403 clears token and shows `sessionNotice`; role gate on StaffLogin is fail-closed.
3. **Destructive confirms** — Dialog + `busy` for cancel / verify / hold / suspend / refund propose.
4. **Money clarity at commitment** — `CheckoutSummary` on post preview, confirm, and accept.
5. **Thai status + next-action hints** on party booking/offer rows (when labels exist).
6. **Thread soft-warn** blocks send when patient identifiers appear — correct safety UX; only the styling is off.
7. **Toast a11y** — separate assertive/polite live regions; errors linger longer than success.
8. **Branded 404 / route error** — recovery paths feel on-brand, not framework-default.
9. **Design tokens** — clinical teal, Anuphan/Sarabun, light/dark, restrained motion with reduced-motion respect.

---

## 5. Recommended fix order

| Priority | Item | Effort |
|---|---|---|
| 1 | S1 Clinic/Pro loading vs empty | Medium — add loading flags + skeletons |
| 2 | S2 Search idle vs empty copy | Small |
| 3 | S3 Verification badge tones + missing `th.status` VER labels | Small |
| 4 | S4 Ops `statusLabel(b.state)` | Trivial |
| 5 | S5 Per-action `busyId` on clinic/pro | Medium |
| 6 | S6 Finance table skeletons / adopt `DataTable` | Small–Medium |
| 7 | S7 Refund field validation | Small |
| 8 | S8 Pro offers count/list alignment | Small |
| 9 | S9–S14 polish | Small each |

---

## 6. Appendix — flow coverage checklist

| Flow | States reviewed |
|---|---|
| Landing → RolePicker → role home | Initial, busy, error, success navigate |
| Sign-in + reset demo | Initial, resetting, success/error toast |
| Clinic: post → search → offer → confirm/pay → complete/cancel → thread | All table §2.2 |
| Pro: profile → offers → filter/apply → accept/decline → arrive/complete/review → thread | All table §2.3 |
| Ops: OTP → metrics → verify → cases → hold/suspend | All table §2.5 |
| Finance: OTP → recon → filter → refund propose/approve → CSV | All table §2.6 |
| Journey guided walkthrough | Idle, progress, done, error |
| Flow e2e harness | Idle, running, payout, reviews, error |
| 404 / render error | Recovery CTAs |

### Key files

```
apps/web/src/app/{page,error,not-found}.tsx
apps/web/src/app/{signin,clinic,pro,ops,finance,journey,flow}/page.tsx
apps/web/src/components/{EmptyState,Skeleton,DataTable,Toast,Dialog,Button,Field,
  StaffLogin,RolePicker,BookingThread,CheckoutSummary,ProfilePanel}.tsx
apps/web/src/lib/{strings,status,tones,session,api}.ts
apps/web/src/styles/{tokens,components,pages}.css
packages/domain/src/states.ts
```
