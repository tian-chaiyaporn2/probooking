"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "./Toast";
import { loginAs } from "../lib/api";
import { getThaiErrorMessage, th } from "../lib/strings";
import { DEMO_ACCOUNTS, saveSession, type DemoAccount } from "../lib/demo-accounts";
import { ClinicIcon, StethoscopeIcon, ShieldCheckIcon, WalletIcon } from "./icons";

const PARTY = DEMO_ACCOUNTS.filter((a) => a.role === "clinic" || a.role === "professional");
const STAFF = DEMO_ACCOUNTS.filter((a) => a.role === "operations" || a.role === "finance");

function RoleMark({ acc }: { acc: DemoAccount }) {
  const icon =
    acc.role === "clinic" ? (
      <ClinicIcon />
    ) : acc.role === "professional" ? (
      <StethoscopeIcon />
    ) : acc.role === "operations" ? (
      <ShieldCheckIcon />
    ) : (
      <WalletIcon />
    );
  return (
    <span className="signin-card__mark" aria-hidden>
      {icon}
    </span>
  );
}

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
    <div className="role-picker">
      <p className="role-picker__path muted">{th.home.pickPath}</p>
      <div className="role-picker__group">
        <h3 className="role-picker__heading">{th.home.pickParty}</h3>
        <div className="signin-grid">
          {PARTY.map((acc) => (
            <button
              key={acc.phone}
              type="button"
              className="signin-card"
              data-testid={`signin-${acc.id}`}
              disabled={busy !== null}
              onClick={() => void signInAs(acc)}
            >
              <RoleMark acc={acc} />
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
      </div>
      <div className="role-picker__group">
        <h3 className="role-picker__heading">{th.home.pickStaff}</h3>
        <div className="signin-grid">
          {STAFF.map((acc) => (
            <button
              key={acc.phone}
              type="button"
              className="signin-card"
              data-testid={`signin-${acc.id}`}
              disabled={busy !== null}
              onClick={() => void signInAs(acc)}
            >
              <RoleMark acc={acc} />
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
      </div>
    </div>
  );
}
