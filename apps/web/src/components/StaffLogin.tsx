"use client";

import { useEffect, useRef, useState } from "react";
import { requestOtp, verifyOtp } from "../lib/api";
import { getThaiErrorMessage, th } from "../lib/strings";
import { Button } from "./Button";
import { ShieldCheckIcon, WalletIcon } from "./icons";

const OPS_ROLES = new Set(["operations", "administrator"]);
const FINANCE_ROLES = new Set(["finance", "administrator"]);

function normalizePhone(raw: string): string {
  return raw.trim().replace(/[\s-]/g, "");
}

/**
 * OTP login for the internal dashboards (Operations / Finance).
 *
 * These used to call `/auth/dev/token`, which mints a privileged token to anyone and 404s
 * in production — so the dashboards were both a takeover vector and broken against a real
 * API. This drives the same OTP flow real staff use: the token's authority comes from the
 * phone's entry in the server's access list (STAFF_PHONES), not from anything the page asks
 * for.
 *
 * The form also checks the returned role against the surface before accepting the token —
 * an ordinary user who can complete OTP must not be treated as signed into Ops/Finance.
 */
export function StaffLogin({
  surface,
  onToken,
}: {
  surface: "operations" | "finance";
  onToken: (token: string) => void;
}) {
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [stage, setStage] = useState<"phone" | "code">("phone");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const phoneRef = useRef<HTMLInputElement>(null);
  const codeRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (stage === "phone") phoneRef.current?.focus();
    else codeRef.current?.focus();
  }, [stage]);

  function roleAllowed(role: string): boolean {
    return surface === "operations" ? OPS_ROLES.has(role) : FINANCE_ROLES.has(role);
  }

  async function completeLogin(rawPhone: string, otp: string) {
    const normalized = normalizePhone(rawPhone);
    const { token, role } = await verifyOtp(normalized, otp);
    if (!roleAllowed(role)) {
      throw new Error("forbidden: requires role for this surface");
    }
    onToken(token);
  }

  async function sendCode() {
    setBusy(true);
    setError(null);
    try {
      const normalized = normalizePhone(phone);
      const { devCode } = await requestOtp(normalized);
      if (devCode) {
        await completeLogin(normalized, devCode);
        return;
      }
      setStage("code");
    } catch (e) {
      setError(getThaiErrorMessage(e, th.staffLogin.sendCodeError));
    } finally {
      setBusy(false);
    }
  }

  async function submitCode() {
    setBusy(true);
    setError(null);
    try {
      await completeLogin(phone, code);
    } catch (e) {
      setError(getThaiErrorMessage(e, th.staffLogin.signInError));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main id="main" className="page">
      <div className="auth-card">
        <div className="auth-card__mark" aria-hidden>
          {surface === "operations" ? <ShieldCheckIcon /> : <WalletIcon />}
        </div>
        <h2>{th.staffLogin.title[surface]}</h2>
        <p className="lead muted">{th.staffLogin.description}</p>
        {stage === "phone" ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (phone) void sendCode();
            }}
          >
            <div className="field">
              <label className="field__label" htmlFor="staff-phone">
                {th.staffLogin.phoneLabel}
              </label>
              <input
                id="staff-phone"
                ref={phoneRef}
                className="input"
                aria-label={th.staffLogin.phoneLabel}
                inputMode="tel"
                autoComplete="tel"
                autoFocus
                placeholder="+66…"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </div>
            <Button type="submit" variant="primary" busy={busy} disabled={!phone.trim()}>
              {th.staffLogin.sendCode}
            </Button>
          </form>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (code.length >= 6) void submitCode();
            }}
          >
            <div className="field">
              <label className="field__label" htmlFor="staff-otp">
                {th.staffLogin.codeLabel}
              </label>
              <input
                id="staff-otp"
                ref={codeRef}
                className="input input--otp"
                aria-label={th.staffLogin.codeLabel}
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                placeholder="••••••"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              />
            </div>
            <div className="actions">
              <Button type="submit" variant="primary" busy={busy} disabled={code.length < 6}>
                {th.staffLogin.signIn}
              </Button>
              <Button
                type="button"
                variant="subtle"
                disabled={busy}
                onClick={() => {
                  setCode("");
                  setError(null);
                  setStage("phone");
                }}
              >
                {th.staffLogin.requestNewCode}
              </Button>
            </div>
          </form>
        )}
        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}
      </div>
    </main>
  );
}
