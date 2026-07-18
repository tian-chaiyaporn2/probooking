# ProBooking — Mobile & Tablet UI Review

**Date:** 2026-07-18  
**Scope:** Responsive behaviour across landing, sign-in, journey, clinic/pro workspaces, Ops, Finance, and shared shell  
**Breakpoints used in product:** drawer nav ≤959px · hero stack ≤960px · phone stack ≤768px · dense phone ≤640px / ≤360px

---

## Verdict

The shell already had a solid mobile foundation (viewport meta, safe-area tokens, 44px touch targets, drawer with focus trap, table scroll regions). Tablet was weaker: the same drawer path as phones is correct, but several surfaces still assumed desktop row layouts, and a few CSS gaps made padded cards and narrow phones fragile.

This pass fixes the highest-impact mobile/tablet issues and extends overflow/nav coverage to tablet widths.

| Surface | Phone | Tablet | Notes after fix |
|---|---|---|---|
| Landing `/` | Good | Good | Brand stays above product mock; RolePicker single-column on phone |
| Sign-in `/signin` | Good | Good | Grid no longer forces 300px min tracks |
| Journey `/journey` | Good | Good | Actions + perspective toggle stack on phone |
| Clinic / Pro | Improved | Improved | Workspace head + compose/filter rows fluid |
| Ops / Finance | Good | Good | Tables still scroll inside `.table-scroll` |
| Shared nav | Good | Good | Drawer through iPad portrait; desktop from 960px |

---

## Findings (reviewed → fixed where noted)

### M1 — Missing `.card--pad` · **P0** · fixed

`card--pad` was used on clinic post/search and profile panels but never defined, so form cards had no padding and hugged the border.

### M2 — Hero put product visual above brand on ≤960px · **P1** · fixed

`order: -1` on `.hero__visual` pushed ProBooking below the mock card on phone/tablet. First viewport should lead with brand, then headline, then product visual.

### M3 — RolePicker grid overflow on narrow phones · **P1** · fixed

`minmax(300px, 1fr)` created horizontal overflow when content width &lt; 300px. Now uses `minmax(min(100%, 16.5rem), 1fr)` and forces one column ≤768px.

### M4 — Party dashboards used brittle inline layout · **P1** · fixed

Clinic/pro headers and the post-shift form used fixed `width: 140` inputs and nested `actions` rows that did not stretch on phone. Replaced with `.workspace-head` + `.compose-row` and fluid ≥16px inputs (avoids iOS focus zoom).

### M5 — Filter bars / dialogs / journey CTAs cramped on phone · **P1** · fixed

Shift filters, dialog confirm/cancel, journey primary actions, and perspective toggles now stack to full-width touch targets ≤768px. Filter inputs share the 44px / 16px input rules.

### M6 — Touch sticky hover on RolePicker · **P2** · fixed

`.signin-card:hover` and `.home-surface:hover` now gated behind `(hover: hover) and (pointer: fine)`.

### M7 — Duplicate / weaker `.filter-bar` in `globals.css` · **P2** · fixed

Canonical filter-bar styles live in `components.css`; the globals override (smaller padding, `min-width: 120px`) was removed.

### M8 — Responsive e2e only covered 360px phone · **P2** · fixed

Overflow + drawer tests now cover phone and tablet portrait (768 / 834). Added a brand-before-visual assertion on landing.

---

## Still open (acceptable for Phase 0)

1. **Finance/Ops wide tables** remain horizontally scrollable inside `.table-scroll` — correct for dense money columns; card-row alternatives can wait for Phase 1.
2. **Clinic/pro signed-in overflow** not in the static path list (needs auth seed); covered indirectly by RolePicker + party walkthrough specs.
3. **iPad landscape ≥960px** uses desktop top nav — intentional; drawer MQ stays aligned with `DRAWER_MQ` in `AppHeader`.

---

## Implementation map

| Area | Files |
|---|---|
| Tokens / primitives | `apps/web/src/styles/components.css`, `pages.css`, `globals.css` |
| Party surfaces | `clinic/page.tsx`, `pro/page.tsx`, `BookingThread.tsx`, `ProfilePanel.tsx` |
| Tests | `e2e/tests/booking-flow.spec.ts` |
