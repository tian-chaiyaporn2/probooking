/**
 * PDPA/privacy helpers (§7.3). Phase-1 scope: field masking for internal surfaces
 * and a heuristic guard for patient/personal identifiers in free text. A full
 * classifier is explicitly out of scope — "warnings and manual removal are
 * sufficient for Phase 1".
 */

/** Mask a phone for display on internal surfaces: keep country + last 4 digits. */
export function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 4) return "•••";
  const last4 = digits.slice(-4);
  const lead = phone.startsWith("+") ? `+${digits.slice(0, 2)}` : "";
  return `${lead}${"•".repeat(Math.max(3, digits.length - 4 - (lead ? 2 : 0)))}${last4}`;
}

/** Mask an arbitrary actor label — masks it only if it looks like a phone number. */
export function maskActor(label: string): string {
  return /^\+?\d[\d\s-]{6,}$/.test(label) ? maskPhone(label) : label;
}

// Heuristics for identifiers that must never appear in profiles/shifts/messages/
// reviews (§7.3). Intentionally conservative — a few high-signal patterns only.
const THAI_NATIONAL_ID = /\b\d[\s-]?(?:\d[\s-]?){12}\b/; // 13 digits, optional separators
const HOSPITAL_NUMBER = /\b(?:hn|an|ผู้ป่วย)[\s:.#-]*\d{4,}\b/i; // HN/AN/patient + number

/** True if the text appears to contain a patient/personal identifier (§7.3). */
export function containsProhibitedPatientData(text: string): boolean {
  return THAI_NATIONAL_ID.test(text) || HOSPITAL_NUMBER.test(text);
}
