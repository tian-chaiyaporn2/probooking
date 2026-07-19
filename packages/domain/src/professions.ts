/**
 * Professions a professional can register as (Phase 1). The product serves clinic support
 * staff — primarily dental assistants (ผู้ช่วยทันตแพทย์), widening to nurses (พยาบาล).
 *
 * Credential requirements are profession-dependent (VER-04): a nurse is a licensed
 * practitioner (สภาการพยาบาล) and must hold a valid licence through shift end; a dental
 * assistant is NOT a licensed practitioner, so no professional licence is required — identity
 * and experience are what get verified.
 */
export const PROFESSIONS = ["dental_assistant", "nurse"] as const;

export type Profession = (typeof PROFESSIONS)[number];

/** Whether a profession must hold a verified professional licence (VER-04) to book. */
export function requiresLicence(profession: string): boolean {
  return profession === "nurse";
}
