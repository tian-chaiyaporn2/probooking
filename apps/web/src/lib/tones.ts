/**
 * Shared semantic tones for the clinical-trust design system.
 * Prefer these names at component APIs; CSS maps them onto token colors.
 */
export type Tone = "neutral" | "info" | "accent" | "success" | "warning" | "danger";

/** Badge visual tones (neutral ≡ muted in CSS). */
export type BadgeTone = Tone | "muted" | "warn";

export function resolveBadgeTone(tone?: BadgeTone): Exclude<Tone, never> | "muted" {
  if (!tone || tone === "neutral" || tone === "muted") return "muted";
  if (tone === "warn") return "warning";
  return tone;
}

/** Domain → badge tone for ops/finance surfaces. */
export function badgeToneForKind(kind: string): BadgeTone {
  if (kind === "clinic") return "info";
  if (kind === "professional") return "accent";
  if (kind === "credential_hold") return "warning";
  return "muted";
}
