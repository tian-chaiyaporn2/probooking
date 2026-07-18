"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AppHeader } from "../../components/AppHeader";
import { useToast } from "../../components/Toast";
import { loginAs } from "../../lib/api";
import { getThaiErrorMessage } from "../../lib/strings";
import { DEMO_ACCOUNTS, saveSession, type DemoAccount } from "../../lib/demo-accounts";

/**
 * "Sign in as" demo picker. Each card logs in as a ready-made account for a role and lands
 * on that role's surface, so you can drive the marketplace by hand from each side rather
 * than one-click everything.
 */
export default function SignInPage() {
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
    <>
      <AppHeader current="/signin" />
      <main className="page" style={{ maxWidth: 720 }}>
        <header style={{ marginBottom: "var(--s5)" }}>
          <h1 style={{ margin: "0 0 var(--s2)" }}>เข้าใช้งานในบทบาทต่าง ๆ</h1>
          <p className="muted" style={{ margin: 0 }}>เลือกบัญชีทดลองเพื่อเข้าใช้งานในมุมมองของแต่ละบทบาท</p>
        </header>
        <div className="signin-grid">
          {DEMO_ACCOUNTS.map((acc) => (
            <button
              key={acc.phone}
              type="button"
              className="signin-card"
              data-testid={`signin-${acc.id}`}
              disabled={busy !== null}
              onClick={() => void signInAs(acc)}
            >
              <span className="signin-card__emoji" aria-hidden>
                {acc.emoji}
              </span>
              <span className="signin-card__body">
                <span className="signin-card__label">{acc.label}</span>
                <span className="signin-card__sub">{acc.sublabel}</span>
              </span>
              <span className="signin-card__go">{busy === acc.phone ? "…" : "เข้าสู่ระบบ →"}</span>
            </button>
          ))}
        </div>
        <p className="muted" style={{ fontSize: "0.85rem", marginTop: "var(--s5)" }}>
          บัญชีทดลองสำหรับเดโมเท่านั้น (โหมด AUTH_DEV_MODE) — รหัส OTP จะกรอกให้อัตโนมัติ
        </p>
      </main>
    </>
  );
}
