"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AppHeader } from "../../components/AppHeader";
import { Button } from "../../components/Button";
import { RolePicker } from "../../components/RolePicker";
import { useToast } from "../../components/Toast";
import { resetDemo } from "../../lib/api";
import { getThaiErrorMessage, th } from "../../lib/strings";
import { clearSession } from "../../lib/session";

function scrollToStaffGroup() {
  const el = document.getElementById("staff");
  if (!el) return;
  el.scrollIntoView({ behavior: "smooth", block: "start" });
  if (!el.hasAttribute("tabindex")) el.setAttribute("tabindex", "-1");
  el.focus({ preventScroll: true });
}

/**
 * "Sign in as" demo page. Pick a ready-made account for any role and land on that role's
 * surface. A "reset demo" control restores the seeded data for a clean run.
 */
export default function SignInPage() {
  const toast = useToast();
  const [resetting, setResetting] = useState(false);

  useEffect(() => {
    if (window.location.hash === "#staff") scrollToStaffGroup();
    const onHash = () => {
      if (window.location.hash === "#staff") scrollToStaffGroup();
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

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
          <p
            className="guided-demo muted"
            style={{ margin: "var(--s3) 0 0" }}
            data-testid="guided-demo"
          >
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
          <Button
            type="button"
            variant="subtle"
            data-testid="reset-demo"
            busy={resetting}
            onClick={() => void onReset()}
          >
            {th.signin.resetLabel}
          </Button>
        </div>
      </main>
    </>
  );
}
