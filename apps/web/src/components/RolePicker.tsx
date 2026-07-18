"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "./Toast";
import {
  ClinicIcon,
  ShieldCheckIcon,
  StethoscopeIcon,
  WalletIcon,
} from "./icons";
import { loginAs } from "../lib/api";
import { getThaiErrorMessage, th } from "../lib/strings";
import {
  DEMO_ACCOUNTS,
  saveSession,
  clearSession,
  type DemoAccount,
  type DemoIcon,
} from "../lib/demo-accounts";

const ICONS: Record<DemoIcon, typeof ClinicIcon> = {
  clinic: ClinicIcon,
  professional: StethoscopeIcon,
  operations: ShieldCheckIcon,
  finance: WalletIcon,
};

/**
 * Demo "sign in as" picker. Each card logs in via OTP (AUTH_DEV_MODE) and lands on
 * that role's surface. Icons replace emoji so the picker matches the design system.
 */
export function RolePicker() {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);

  async function signInAs(acc: DemoAccount) {
    setBusy(acc.phone);
    try {
      const token = await loginAs(acc.phone);
      clearSession();
      saveSession(token, acc.phone, acc.role);
      router.push(acc.route);
    } catch (e) {
      toast.error(getThaiErrorMessage(e));
      setBusy(null);
    }
  }

  return (
    <div
      className="signin-grid"
      aria-busy={busy !== null || undefined}
    >
      {DEMO_ACCOUNTS.map((acc) => {
        const Icon = ICONS[acc.icon];
        const isBusy = busy === acc.phone;
        return (
          <button
            key={acc.phone}
            type="button"
            className="signin-card"
            data-testid={`signin-${acc.id}`}
            disabled={busy !== null}
            aria-busy={isBusy || undefined}
            onClick={() => void signInAs(acc)}
          >
            <span className="signin-card__top">
              <span className="signin-card__icon" aria-hidden>
                <Icon style={{ fontSize: "1.35rem" }} />
              </span>
              <span className="signin-card__body">
                <span className="signin-card__label">{acc.label}</span>
                <span className="signin-card__sub">{acc.sublabel}</span>
                <span className="signin-card__phone">
                  <code>{acc.phone}</code> · OTP อัตโนมัติ
                </span>
              </span>
            </span>
            <span className="signin-card__go">
              {isBusy ? (
                <>
                  <span className="btn__spinner" aria-hidden />
                  {th.common.loading}
                </>
              ) : (
                "เข้าสู่ระบบ →"
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
}
