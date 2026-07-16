/**
 * Content policy for prohibited patient/personal identifiers (§7.3). Pure predicate
 * so both the API and the BDD spec share one definition. A full classifier is out of
 * scope for Phase 1 — "warnings and manual removal are sufficient".
 */

// High-signal patterns only, kept conservative to limit false positives.
const THAI_NATIONAL_ID = /\b\d[\s-]?(?:\d[\s-]?){12}\b/; // 13 digits, optional separators
const HOSPITAL_NUMBER = /\b(?:hn|an|ผู้ป่วย)[\s:.#-]*\d{4,}\b/i; // HN/AN/patient + number

/** True if the text appears to contain a patient/personal identifier (§7.3). */
export function containsProhibitedPatientData(text: string): boolean {
  return THAI_NATIONAL_ID.test(text) || HOSPITAL_NUMBER.test(text);
}
