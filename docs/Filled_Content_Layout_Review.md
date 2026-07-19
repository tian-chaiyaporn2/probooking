# ProBooking — Filled-Content Layout Review (Mobile & Tablet)

**Date:** 2026-07-19  
**Scope:** Layout misalignment when surfaces are **populated** — long Thai names, money amounts, multi-badge chips, dual CTAs, filled filters/forms — especially on phone and tablet portrait.  
**Builds on:** [`Mobile_Tablet_UI_Review.md`](./Mobile_Tablet_UI_Review.md) (shell / empty-structure pass).

---

## Verdict

Empty shells mostly looked fine after the earlier responsive pass. **Filled rows and headers** still broke: flex children could not shrink (`min-width: auto`), badges stayed `nowrap`, stats clipped values, and the **769–959px tablet band** kept desktop-style action rows while the nav already used the drawer.

This pass fixes those filled-content failure modes without changing desktop (≥960) layout.

| Surface | Empty | Filled (phone) | Filled (tablet 769–959) |
|---|---|---|---|
| Ops / Finance headers + stats | OK | Values wrap; title column shrinks | Actions stack; 3-col stats unchanged |
| Clinic / Pro workspace heads | OK | Long names wrap beside avatar | Head + row actions stack with drawer band |
| Profile chips / badges | OK | Long status chips wrap | Same |
| Row lists (offers, verify, bookings) | OK | Money + name wrap | Actions full-width ≤959 |
| Checkout / thread / dialogs | OK | Fixed table + wrap | Same |
| Compose / filter bars | OK | Stack ≤959 | No more side-by-side squeeze |

---

## Findings → fixed

### F1 — Page / workspace title columns could not shrink · **P0**

`.page-head` and `.workspace-head` put titles in bare flex children. Long Thai titles + meta (verification badge, rating) competed with actions until ≤768 stacking.

**Fix:** `.page-head__copy` / `.workspace-head__copy` with `flex: 1 1 12rem; min-width: 0` and `overflow-wrap` on titles/meta. Markup updated in `PageHeader`, clinic, and pro.

### F2 — Tablet action rows stayed desktop-shaped · **P0**

Row actions, compose, filter, and workspace actions only stacked at ≤768. Between **769–959** (drawer already on), filled offer/verify rows squeezed name + money + dual buttons.

**Fix:** Raise those stack rules to `@media (max-width: 959px)` to match `DRAWER_MQ`.

### F3 — Stat tiles clipped filled amounts · **P0**

`.stat { overflow: hidden }` + large `.stat__value` hid long THB in 2- and 3-column grids.

**Fix:** Allow wrap/`clamp` on values and labels; keep clip only for the accent rail geometry.

### F4 — Badges / buttons / checkout / thread overflow · **P1**

- Badges: `white-space: nowrap` on long Thai statuses.
- Buttons embedding names (`ส่งข้อเสนอ → …`) had no `max-width`.
- Checkout tables lacked `table-layout: fixed` + wrap.
- Thread bodies used `pre-wrap` without `overflow-wrap`.

**Fix:** Wrap-friendly badge/button rules; fixed checkout layout; thread/contact wrap.

### F5 — Section heads, dialogs, detail grids, identity copy · **P1**

Section title vs count pill, dialog title vs close, ops `row__detail` `auto` label column, identity/meta without wrap, pro-attention non-wrapping strip.

**Fix:** `flex-wrap` + `min-width: 0` / `overflow-wrap`; detail grid `minmax(0, 8rem) minmax(0, 1fr)`; attention strip wraps with `flex: none` arrow.

### F6 — Brand truncation incomplete · **P2**

`.brand` had `min-width: 0` but no ellipsis on the wordmark next to the compact account chip.

**Fix:** `.brand__text` ellipsis + `overflow: hidden` on `.brand`.

---

## Still open (acceptable for Phase 0)

1. **Wide Ops/Finance tables** remain horizontally scrollable inside `.table-scroll` — intentional for dense money columns.
2. **Breakpoint soup** (960 / 959 / 860 / 800 / 768 / …) is reduced for filled-action stacking but not fully collapsed — hero/journey keep their own bands.
3. **Very long unbroken Latin tokens** in thread messages still rely on `overflow-wrap: anywhere`; no soft-hyphen dictionary for Thai.

---

## Implementation map

| Area | Files |
|---|---|
| Primitives / responsive | `apps/web/src/styles/components.css`, `pages.css`, `globals.css` |
| Copy wrappers | `PageHeader.tsx`, `clinic/page.tsx`, `pro/page.tsx`, `AppHeader.tsx` |
| Prior shell review | `docs/Mobile_Tablet_UI_Review.md` |
