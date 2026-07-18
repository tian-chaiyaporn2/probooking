"use client";

import { useState } from "react";
import { AppHeader } from "../../components/AppHeader";
import { Button } from "../../components/Button";
import { PageHeader } from "../../components/PageHeader";
import { RolePicker } from "../../components/RolePicker";
import { useToast } from "../../components/Toast";
import { resetDemo } from "../../lib/api";
import { getThaiErrorMessage, th } from "../../lib/strings";
import { clearSession } from "../../lib/session";

/**
 * "Sign in as" demo page. Pick a ready-made account for any role and land on that role's
 * surface, so the marketplace can be driven by hand from each side rather than one-click
 * everything. A "reset demo" control restores the seeded data for a clean run.
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
        <PageHeader title={th.signin.title} subtitle={th.signin.subtitle} />
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
          <p className="muted" style={{ fontSize: "0.85rem", margin: 0 }}>
            {th.signin.demoHint}
          </p>
          <Button
            type="button"
            variant="subtle"
            data-testid="reset-demo"
            busy={resetting}
            onClick={() => void onReset()}
          >
            {th.signin.reset}
          </Button>
        </div>
      </main>
    </>
  );
}
