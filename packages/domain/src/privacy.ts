/**
 * Content policy for prohibited patient/personal identifiers (§7.3). Pure predicate
 * so both the API and the BDD spec share one definition. A full classifier is out of
 * scope for Phase 1 — "warnings and manual removal are sufficient".
 */

// High-signal patterns only, kept conservative to limit false positives. Note: JS `\b`
// is ASCII-only, so Thai keywords are matched WITHOUT a word boundary (an earlier bug
// silently disabled the Thai path); the digit patterns use digit-run lookarounds instead.

// Thai national ID: 13 digits, optionally separated by spaces/hyphens. Digits are ASCII,
// so this matches even when embedded in Thai text.
const THAI_NATIONAL_ID = /(?<!\d)\d(?:[ -]?\d){12}(?!\d)/;
// Hospital/patient record numbers. HN/OPD/IPD are safe case-insensitively; "AN" is only
// matched uppercase because lowercase "an" is a common English word (false positives).
const RECORD_NUMBER = /\b(?:hn|opd|ipd)[\s:.#-]*\d{3,}\b/i;
const ADMISSION_NUMBER = /\bAN[\s:.#-]*\d{3,}\b/;
// Thai keyword for "patient" (ผู้ป่วย) appearing near a number — no `\b` (Thai isn't ASCII).
const THAI_PATIENT = /ผู้ป่วย[\s\S]{0,12}?\d{3,}/;

/** True if the text appears to contain a patient/personal identifier (§7.3). */
export function containsProhibitedPatientData(text: string): boolean {
  return (
    THAI_NATIONAL_ID.test(text) ||
    RECORD_NUMBER.test(text) ||
    ADMISSION_NUMBER.test(text) ||
    THAI_PATIENT.test(text)
  );
}
