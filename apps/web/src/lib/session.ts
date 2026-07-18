/** Staff session persistence for Ops/Finance (Phase 0 interim — sessionStorage, not httpOnly). */

export type StaffSurface = "operations" | "finance";

export interface StaffSession {
  token: string;
  surface: StaffSurface;
  savedAt: number;
}

const keyFor = (surface: StaffSurface) => `pb.staff.session.${surface}`;

export function loadStaffSession(surface: StaffSurface): StaffSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(keyFor(surface));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StaffSession;
    if (!parsed?.token || parsed.surface !== surface) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveStaffSession(surface: StaffSurface, token: string): void {
  if (typeof window === "undefined") return;
  const session: StaffSession = { token, surface, savedAt: Date.now() };
  sessionStorage.setItem(keyFor(surface), JSON.stringify(session));
}

export function clearStaffSession(surface: StaffSurface): void {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem(keyFor(surface));
}

/** Clear both staff surfaces (use when switching into a party role via RolePicker). */
export function clearAllStaffSessions(): void {
  clearStaffSession("operations");
  clearStaffSession("finance");
}

/** Clear party + staff session keys so role switches cannot leak prior identity. */
export function clearAllAppSessions(): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem("probook.session");
  } catch {
    /* ignore */
  }
  clearAllStaffSessions();
}
