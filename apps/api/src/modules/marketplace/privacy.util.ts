/**
 * PDPA/privacy helpers (§7.3). Field masking for internal surfaces lives here; the
 * pure patient-data content predicate lives in @probook/domain so the BDD spec and
 * the API share one definition. Re-exported for existing call sites.
 */
export { containsProhibitedPatientData } from "@probook/domain";

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
