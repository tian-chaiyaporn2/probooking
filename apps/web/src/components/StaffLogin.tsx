"use client";

import { useEffect, useRef, useState } from "react";
import { requestOtp, verifyOtp } from "../lib/api";
import { getThaiErrorMessage, th } from "../lib/strings";
import { Button } from "./Button";
import { ShieldCheckIcon, WalletIcon } from "./icons";

/**
 * OTP login for the internal dashboards (Operations / Finance).
 *
 * These used to call `/auth/dev/token`, which mints a privileged token to anyone and 404s
 * in production — so the dashboards were both a takeover vector and broken against a real
 * API. This drives the same OTP flow real staff use: the token's authority comes from the
 * phone's entry in the server's access list (STAFF_PHONES), not from anything the page asks
 * for. A phone that is not staff simply logs in as an ordinary user and the guarded calls
 * 403.
 *
 * Under AUTH_DEV_MODE the request echoes the code back, so the demo logs in in one step; in
 * production the code arrives by SMS and the operator types it.
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

  async function sendCode() {
    setBusy(true);
    setError(null);
    try {
      const { devCode } = await requestOtp(phone);
      if (devCode) {
        // Dev mode: the server returned the code, so complete the login immediately.
        const { token } = await verifyOtp(phone, devCode);
        onToken(token);
        return;
      }
      setStage("code"); // production: collect the SMS code
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
      const { token } = await verifyOtp(phone, code);
      onToken(token);
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
