/**
 * Shared semantic tones for the clinical-trust design system.
 * Prefer these names at component APIs; CSS maps them onto token colors.
 */
export type Tone = "neutral" | "info" | "accent" | "success" | "warning" | "danger";

/** Badge tones — `muted`/`warn` are aliases for `neutral`/`warning`. */
export type BadgeTone = Tone | "muted" | "warn";

export type ResolvedBadgeTone = "muted" | "info" | "accent" | "success" | "warning" | "danger";

export function resolveBadgeTone(tone: BadgeTone = "muted"): ResolvedBadgeTone {
  if (tone === "neutral" || tone === "muted") return "muted";
  if (tone === "warn") return "warning";
  return tone;
}

/** Domain → badge tone for ops/finance surfaces. */
export function badgeToneForKind(kind: string): ResolvedBadgeTone {
  if (kind === "clinic") return "info";
  if (kind === "professional") return "accent";
  if (kind === "credential_hold") return "warning";
  return "muted";
}
