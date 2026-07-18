# ProBooking web design system

Clinical-trust UI for Thai-first staff and marketplace surfaces.

## Structure

| Layer | Location |
|-------|----------|
| Tokens | `src/styles/tokens.css` — color, type, space, radius, shadow, safe-area |
| Base | `src/styles/base.css` — reset, typography, focus, `.page` |
| Components | `src/styles/components.css` + `src/components/*` |
| Pages | `src/styles/pages.css` — landing, flow, not-found, responsive |

Entry: `src/app/globals.css` imports the four layers.

## Tones

Use `lib/tones.ts`: `neutral | info | accent | success | warning | danger`.

- Badge: `tone` prop (aliases: `muted`→neutral, `warn`→warning)
- Stat: `success | danger` (+ `default`)
- Toast: `success | error` (error maps to danger colors)

Domain helpers: `badgeToneForKind("clinic" | "professional" | "credential_hold")`.

## Components to prefer

- `Button` / `ButtonLink` / `ButtonAnchor` — never hand-roll `btn btn--*`
- `PageHeader`, `SectionBlock` — dashboard chrome
- `Field` + `Input` — forms
- `EmptyState`, `Skeleton` / `StatSkeletonGrid` — loading & empty
- `DataTable` — tabular data; `KeyValueTable` / `CheckoutSummary` — checkout/summary pairs
- `Dialog` — confirm irreversible Ops/Finance actions
- `StatusTimeline` — offer → Payment Protected → complete lifecycle
- `Badge` (`tone` + `badgeToneForKind`), `Stat`, `Toast`

## Typography (Thai-first)

- Body tracking stays `0`; negative tracking only on Latin brand marks
- No `text-transform: uppercase` on Thai labels
- Heading line-height ≥ `--leading-tight` (1.35)

## Constraints

- Preserve `data-testid` contracts and English `/flow` result copy
- Cards are for interactive/contained ops lists — not decorative chrome
- Keep the teal clinical palette; no purple/cream defaults
- Prefer `Dialog` for irreversible staff confirms; `CheckoutSummary` for fee breakdowns; `StatusTimeline` for booking lifecycle
- Staff sessions use `lib/session.ts` (sessionStorage) until httpOnly cookies land
