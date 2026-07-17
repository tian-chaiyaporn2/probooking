"use client";

import { useState } from "react";
import { requestOtp, verifyOtp } from "../lib/api";
import { Button } from "./Button";

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
  surface: string;
  onToken: (token: string) => void;
}) {
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [stage, setStage] = useState<"phone" | "code">("phone");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      setError((e as Error).message);
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
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card card--pad" style={{ maxWidth: 380, margin: "2rem auto" }}>
      <h2 style={{ marginTop: 0 }}>{surface} sign-in</h2>
      <p className="muted" style={{ fontSize: "0.9rem" }}>
        Staff sign in with the phone number on the access list. A one-time code is sent by SMS.
      </p>
      {stage === "phone" ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (phone) void sendCode();
          }}
        >
          <input
            aria-label="Phone number"
            inputMode="tel"
            placeholder="+66…"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            style={inputStyle}
          />
          <Button type="submit" variant="primary" busy={busy} disabled={!phone}>
            Send code
          </Button>
        </form>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (code) void submitCode();
          }}
        >
          <input
            aria-label="One-time code"
            inputMode="numeric"
            placeholder="6-digit code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            style={inputStyle}
          />
          <Button type="submit" variant="primary" busy={busy} disabled={!code}>
            Sign in
          </Button>
        </form>
      )}
      {error && (
        <p role="alert" style={{ color: "var(--danger)", fontSize: "0.85rem", marginTop: "0.75rem" }}>
          {error}
        </p>
      )}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "0.6rem 0.75rem",
  marginBottom: "0.75rem",
  borderRadius: 8,
  border: "1px solid var(--border)",
  background: "var(--bg)",
  color: "var(--fg)",
  fontSize: "1rem",
};
