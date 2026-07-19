/**
 * Professions a professional can register as (Phase 1). The product serves clinic support
 * staff — primarily dental assistants (ผู้ช่วยทันตแพทย์), widening to nurses (พยาบาล).
 *
 * Every profession must hold a verified professional credential that stays valid through
 * shift end (VER-04) — the KIND differs: a nurse holds a licence (สภาการพยาบาล), a dental
 * assistant holds a training certificate (ใบรับรองผู้ช่วยทันตแพทย์). Both are submitted
 * at registration and verified by Operations before the professional can be booked.
 */
export const PROFESSIONS = ["dental_assistant", "nurse"] as const;

export type Profession = (typeof PROFESSIONS)[number];

export type CredentialKind = "licence" | "certificate";

/** The credential kind a profession must hold and keep valid through shift end (VER-04). */
export function credentialKind(profession: string): CredentialKind {
  return profession === "nurse" ? "licence" : "certificate";
}
