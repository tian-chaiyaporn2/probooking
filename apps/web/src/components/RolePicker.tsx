"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "./Toast";
import { loginAs } from "../lib/api";
import { getThaiErrorMessage } from "../lib/strings";
import { DEMO_ACCOUNTS, saveSession, type DemoAccount } from "../lib/demo-accounts";

/**
 * The "sign in as" demo picker. Each card logs in as a ready-made account for a role and
 * lands on that role's surface, so a tester can drive the marketplace by hand from each side
 * rather than one-click everything. The mock phone is shown on the card and, under
 * AUTH_DEV_MODE, the OTP is auto-filled — nothing to type.
 */
export function RolePicker() {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);

  async function signInAs(acc: DemoAccount) {
    setBusy(acc.phone);
    try {
      const token = await loginAs(acc.phone);
      saveSession(token, acc.phone);
      router.push(acc.route);
    } catch (e) {
      toast.error(getThaiErrorMessage(e));
      setBusy(null);
    }
  }

  return (
    <div className="signin-grid">
      {DEMO_ACCOUNTS.map((acc) => (
        <button
          key={acc.phone}
          type="button"
          className="signin-card"
          data-testid={`signin-${acc.id}`}
          disabled={busy !== null}
          onClick={() => void signInAs(acc)}
        >
          <span className="signin-card__emoji" aria-hidden>
            {acc.emoji}
          </span>
          <span className="signin-card__body">
            <span className="signin-card__label">{acc.label}</span>
            <span className="signin-card__sub">{acc.sublabel}</span>
            <span className="signin-card__phone">
              <code>{acc.phone}</code> · OTP อัตโนมัติ
            </span>
          </span>
          <span className="signin-card__go">{busy === acc.phone ? "…" : "เข้าสู่ระบบ →"}</span>
        </button>
      ))}
    </div>
  );
}
