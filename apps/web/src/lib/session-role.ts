import { DEMO_ACCOUNTS, loadSession } from "./demo-accounts";

export type SessionRole = "clinic" | "professional" | "operations" | "finance" | "unknown";

export interface SessionContext {
  token: string;
  phone: string;
  role: SessionRole;
  label: string;
  route: string | null;
}

export function getSessionContext(): SessionContext | null {
  const sess = loadSession();
  if (!sess) return null;
  const acc = DEMO_ACCOUNTS.find((a) => a.phone === sess.phone);
  return {
    token: sess.token,
    phone: sess.phone,
    role: acc?.role ?? "unknown",
    label: acc?.label ?? "ผู้ใช้งาน",
    route: acc?.route ?? null,
  };
}
