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
  DEMO_PARTY_ACCOUNTS,
  DEMO_STAFF_ACCOUNTS,
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

function AccountCard({
  acc,
  busy,
  onSignIn,
}: {
  acc: DemoAccount;
  busy: string | null;
  onSignIn: (acc: DemoAccount) => void;
}) {
  const Icon = ICONS[acc.icon];
  return (
    <button
      type="button"
      className="signin-card"
      data-testid={`signin-${acc.id}`}
      disabled={busy !== null}
      onClick={() => onSignIn(acc)}
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
        {busy === acc.phone ? "…" : "เข้าสู่ระบบ →"}
      </span>
    </button>
  );
}

/**
 * Demo "sign in as" picker. Party and staff cards are grouped; each logs in via OTP
 * (AUTH_DEV_MODE) and lands on that role's surface.
 */
export function RolePicker({ showGroups = true }: { showGroups?: boolean }) {
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

  if (!showGroups) {
    return (
      <div className="signin-grid">
        {[...DEMO_PARTY_ACCOUNTS, ...DEMO_STAFF_ACCOUNTS].map((acc) => (
          <AccountCard
            key={acc.phone}
            acc={acc}
            busy={busy}
            onSignIn={(a) => void signInAs(a)}
          />
        ))}
      </div>
    );
  }

  return (
    <div className="signin-groups">
      <div className="signin-group" data-testid="signin-party-group">
        <h3 className="signin-group__title">{th.home.partyGroup}</h3>
        <div className="signin-grid">
          {DEMO_PARTY_ACCOUNTS.map((acc) => (
            <AccountCard
              key={acc.phone}
              acc={acc}
              busy={busy}
              onSignIn={(a) => void signInAs(a)}
            />
          ))}
        </div>
      </div>
      <div className="signin-group" id="staff" data-testid="signin-staff-group">
        <h3 className="signin-group__title">{th.home.staffGroup}</h3>
        <div className="signin-grid">
          {DEMO_STAFF_ACCOUNTS.map((acc) => (
            <AccountCard
              key={acc.phone}
              acc={acc}
              busy={busy}
              onSignIn={(a) => void signInAs(a)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
