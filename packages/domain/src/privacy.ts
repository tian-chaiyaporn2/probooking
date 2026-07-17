/**
 * Content policy for prohibited patient/personal identifiers (§7.3). Pure predicate
 * so both the API and the BDD spec share one definition. A full classifier is out of
 * scope for Phase 1 — "warnings and manual removal are sufficient".
 */

// High-signal patterns only, kept conservative to limit false positives. Note: JS `\b`
// is ASCII-only, so Thai keywords are matched WITHOUT a word boundary (an earlier bug
// silently disabled the Thai path); the digit patterns use digit-run lookarounds instead.

// Thai national ID. Written as an unbroken run or in the canonical 1-2345-67890-12-3
// grouping (1-4-5-2-1), with one consistent separator.
//
// It previously allowed each digit its own optional space — `\d(?:[ -]?\d){12}` — so ANY
// run of 13 space-separated digits matched. That blocked real clinical messages outright
// (the API rejects a hit with a 400), e.g. "ward 3 beds 12 5 7 9 11 2 4 6 8 10" and
// "rates 800 900 1000 120". A filter that stops people describing a ward is not a privacy
// control, it is an outage — and it trains users to route around the product.
const THAI_NATIONAL_ID_PLAIN = /(?<![\d-])\d{13}(?![\d-])/;
const THAI_NATIONAL_ID_GROUPED = /(?<!\d)\d[- ]\d{4}[- ]\d{5}[- ]\d{2}[- ]\d(?!\d)/;

// Hospital/patient record numbers. HN/OPD/IPD are safe case-insensitively.
const RECORD_NUMBER = /\b(?:hn|opd|ipd)[\s:.#-]*\d{3,}\b/i;

// "AN" (admission number), uppercase only — lowercase "an" is a common English word.
//
// This knowingly keeps a false positive: "PLEASE SEND AN 2024 SUMMARY" has exactly the
// same shape as "admit AN 4821", and no pattern separates them — the difference is meaning,
// not syntax. Given the choice, we keep the false positive: missing a real admission number
// is a PDPA leak, while the cost here is a rare all-caps sentence being rejected.
//
// The better answer is not a cleverer regex — it is that §7.3 asks for "warnings and manual
// removal", while the API hard-rejects a hit with a 400. Warning on this pattern and
// blocking only the unambiguous ones (national ID, HN/OPD/IPD) would remove the trade-off
// entirely. Left as-is because changing an enforcement level is a product decision.
const ADMISSION_NUMBER = /\bAN[\s:.#-]*\d{3,}\b/;
// Thai keyword for "patient" (ผู้ป่วย) appearing near a number — no `\b` (Thai isn't ASCII).
const THAI_PATIENT = /ผู้ป่วย[\s\S]{0,12}?\d{3,}/;

/** True if the text appears to contain a patient/personal identifier (§7.3). */
export function containsProhibitedPatientData(text: string): boolean {
  return (
    THAI_NATIONAL_ID_PLAIN.test(text) ||
    THAI_NATIONAL_ID_GROUPED.test(text) ||
    RECORD_NUMBER.test(text) ||
    ADMISSION_NUMBER.test(text) ||
    THAI_PATIENT.test(text)
  );
}
