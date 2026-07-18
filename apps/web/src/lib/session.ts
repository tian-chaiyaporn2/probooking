/**
 * Canonical client session for the static-export web app.
 *
 * The API is Bearer-only (no Set-Cookie) and Next is `output: "export"`, so httpOnly
 * cookies are not available without a BFF. One sessionStorage key holds the token for
 * every role; legacy staff-scoped keys are cleared on read/write.
 */

export type SessionRole =
  "clinic" | "professional" | "operations" | "finance" | "administrator";

export interface AppSession {
  token: string;
  phone: string;
  role?: SessionRole;
}

const KEY = "probook.session";
const LEGACY_STAFF = [
  "pb.staff.session.operations",
  "pb.staff.session.finance",
] as const;

function purgeLegacy(): void {
  if (typeof window === "undefined") return;
  for (const k of LEGACY_STAFF) {
    try {
      sessionStorage.removeItem(k);
    } catch {
      /* ignore */
    }
  }
}

export function saveSession(
  token: string,
  phone: string,
  role?: SessionRole,
): void {
  if (typeof window === "undefined") return;
  purgeLegacy();
  const session: AppSession = { token, phone, ...(role ? { role } : {}) };
  sessionStorage.setItem(KEY, JSON.stringify(session));
}

export function loadSession(): AppSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) {
      // One-shot migration: lift a leftover staff token into the canonical key.
      for (const k of LEGACY_STAFF) {
        const legacy = sessionStorage.getItem(k);
        if (!legacy) continue;
        const parsed = JSON.parse(legacy) as { token?: string };
        if (parsed?.token) {
          const surface = k.endsWith("operations") ? "operations" : "finance";
          const migrated: AppSession = {
            token: parsed.token,
            phone: "",
            role: surface,
          };
          sessionStorage.setItem(KEY, JSON.stringify(migrated));
          purgeLegacy();
          return migrated;
        }
      }
      return null;
    }
    const parsed = JSON.parse(raw) as AppSession;
    if (!parsed?.token) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearSession(): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
  purgeLegacy();
}

/** @deprecated Use clearSession — kept for call-sites during the unification. */
export function clearAllAppSessions(): void {
  clearSession();
}

/** @deprecated Use loadSession. */
export type StaffSurface = "operations" | "finance";
export type StaffSession = AppSession;

/** @deprecated Use loadSession. */
export function loadStaffSession(surface: StaffSurface): StaffSession | null {
  const s = loadSession();
  if (!s) return null;
  // Accept any session for the surface boot path; role mismatch is caught by API 403.
  void surface;
  return s;
}

/** @deprecated Use saveSession. */
export function saveStaffSession(surface: StaffSurface, token: string): void {
  saveSession(token, "", surface);
}

/** @deprecated Use clearSession. */
export function clearStaffSession(_surface: StaffSurface): void {
  void _surface;
  clearSession();
}

/** @deprecated Use clearSession. */
export function clearAllStaffSessions(): void {
  clearSession();
}
