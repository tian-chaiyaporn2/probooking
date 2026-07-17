"use client";

import { useEffect, useState } from "react";
import {
  DEMO_STAFF_PHONES,
  getDevToken,
  isDevAuthEnabled,
  requestOtp,
  verifyOtp,
} from "../lib/api";
import { getThaiErrorMessage, th } from "../lib/strings";
import { Button } from "./Button";

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
 * When AUTH_DEV_MODE is on, the form also offers one-click demo sign-in (and staff-phone
 * chips) so local explorers can walk Ops/Finance without memorising demo numbers.
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
  const [devMode, setDevMode] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void isDevAuthEnabled().then((on) => {
      if (!cancelled) setDevMode(on);
    });
    return () => {
      cancelled = true;
    };
  }, []);

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

  async function sendCode(overridePhone?: string) {
    setBusy(true);
    setError(null);
    try {
      const normalized = normalizePhone(overridePhone ?? phone);
      if (overridePhone) setPhone(normalized);
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

  async function quickDevSignIn() {
    setBusy(true);
    setError(null);
    try {
      const { token, role } = await getDevToken(surface);
      if (!roleAllowed(role)) {
        throw new Error("forbidden: requires role for this surface");
      }
      onToken(token);
    } catch (e) {
      setError(getThaiErrorMessage(e, th.staffLogin.devSignInError));
    } finally {
      setBusy(false);
    }
  }

  const demoPhone = DEMO_STAFF_PHONES[surface];

  return (
    <div className="card card--pad" style={{ maxWidth: 420, margin: "2rem auto" }}>
      <h2 style={{ marginTop: 0 }}>{th.staffLogin.title[surface]}</h2>
      <p className="muted" style={{ fontSize: "0.9rem" }}>
        {devMode ? th.staffLogin.descriptionDev : th.staffLogin.description}
      </p>

      {devMode && stage === "phone" && (
        <div style={{ marginBottom: "1rem" }}>
          <Button
            type="button"
            variant="primary"
            busy={busy}
            onClick={() => void quickDevSignIn()}
            data-testid="dev-quick-signin"
          >
            {th.staffLogin.devSignIn}
          </Button>
          <p className="muted" style={{ fontSize: "0.8rem", margin: "0.75rem 0 0.35rem" }}>
            {th.staffLogin.orOtp}
          </p>
          <div className="actions" style={{ flexWrap: "wrap", gap: "0.5rem" }}>
            <Button
              type="button"
              variant="subtle"
              disabled={busy}
              onClick={() => void sendCode(demoPhone)}
              data-testid="demo-staff-phone"
            >
              {demoPhone}
            </Button>
          </div>
        </div>
      )}

      {stage === "phone" ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (phone) void sendCode();
          }}
        >
          <input
            aria-label={th.staffLogin.phoneLabel}
            inputMode="tel"
            placeholder="+66…"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            style={inputStyle}
          />
          <Button type="submit" variant="primary" busy={busy} disabled={!phone}>
            {th.staffLogin.sendCode}
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
            aria-label={th.staffLogin.codeLabel}
            inputMode="numeric"
            placeholder={th.staffLogin.codePlaceholder}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            style={inputStyle}
          />
          <div className="actions">
            <Button type="submit" variant="primary" busy={busy} disabled={!code}>
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
  border: "1px solid var(--line)",
  background: "var(--bg)",
  color: "var(--text)",
  fontSize: "1rem",
};
