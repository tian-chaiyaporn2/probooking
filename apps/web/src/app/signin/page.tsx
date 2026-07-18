"use client";

import Link from "next/link";
import { useState } from "react";
import { AppHeader } from "../../components/AppHeader";
import { RolePicker } from "../../components/RolePicker";
import { useToast } from "../../components/Toast";
import { resetDemo } from "../../lib/api";
import { getThaiErrorMessage, th } from "../../lib/strings";
import { clearSession } from "../../lib/session";

/**
 * "Sign in as" demo page. Pick a ready-made account for any role and land on that role's
 * surface. A "reset demo" control restores the seeded data for a clean run.
 */
export default function SignInPage() {
  const toast = useToast();
  const [resetting, setResetting] = useState(false);

  async function onReset() {
    setResetting(true);
    try {
      await resetDemo();
      clearSession();
      toast.success(th.signin.resetDone);
    } catch (e) {
      toast.error(getThaiErrorMessage(e));
    } finally {
      setResetting(false);
    }
  }

  return (
    <>
      <AppHeader current="/signin" />
      <main id="main" className="page" style={{ maxWidth: 720 }}>
        <header style={{ marginBottom: "var(--s5)" }}>
          <h1 style={{ margin: "0 0 var(--s2)" }}>{th.signin.title}</h1>
          <p className="muted" style={{ margin: 0 }}>
            {th.signin.subtitle}
          </p>
          <p className="guided-demo muted" style={{ margin: "var(--s3) 0 0" }}>
            {th.home.guidedDemo}
          </p>
          <p style={{ margin: "var(--s3) 0 0" }}>
            <Link href="/" className="footer__link" data-testid="signin-back-home">
              {th.signin.backHome}
            </Link>
          </p>
        </header>
        <RolePicker />
        <div
          className="actions"
          style={{
            justifyContent: "space-between",
            marginTop: "var(--s5)",
            flexWrap: "wrap",
            gap: "var(--s3)",
          }}
        >
          <div>
            <p className="muted" style={{ fontSize: "0.85rem", margin: 0 }}>
              {th.signin.demoHint}
            </p>
            <p className="muted" style={{ fontSize: "0.8rem", margin: "var(--s2) 0 0" }}>
              {th.signin.resetHelper}
            </p>
          </div>
          <button
            type="button"
            className="btn btn--subtle"
            data-testid="reset-demo"
            disabled={resetting}
            onClick={() => void onReset()}
          >
            {resetting ? th.signin.resetting : th.signin.resetLabel}
          </button>
        </div>
      </main>
    </>
  );
}
