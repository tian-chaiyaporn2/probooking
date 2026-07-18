"use client";

import { useState } from "react";
import { AppHeader } from "../../components/AppHeader";
import { RolePicker } from "../../components/RolePicker";
import { useToast } from "../../components/Toast";
import { resetDemo } from "../../lib/api";
import { getThaiErrorMessage } from "../../lib/strings";
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
      toast.success("รีเซ็ตข้อมูล demo แล้ว");
    } catch (e) {
      toast.error(getThaiErrorMessage(e));
    } finally {
      setResetting(false);
    }
  }

  return (
    <>
      <AppHeader current="/signin" />
      <main className="page" style={{ maxWidth: 720 }}>
        <header style={{ marginBottom: "var(--s5)" }}>
          <h1 style={{ margin: "0 0 var(--s2)" }}>เข้าใช้งานในบทบาทต่าง ๆ</h1>
          <p className="muted" style={{ margin: 0 }}>
            เลือกบัญชีทดลองเพื่อเข้าใช้งานในมุมมองของแต่ละบทบาท
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
          <p className="muted" style={{ fontSize: "0.85rem", margin: 0 }}>
            บัญชีทดลองสำหรับ demo เท่านั้น (โหมด AUTH_DEV_MODE) รหัส OTP
            จะกรอกให้อัตโนมัติ
          </p>
          <button
            type="button"
            className="btn btn--subtle"
            data-testid="reset-demo"
            disabled={resetting}
            onClick={() => void onReset()}
          >
            {resetting ? "กำลังรีเซ็ต…" : "รีเซ็ตข้อมูล demo"}
          </button>
        </div>
      </main>
    </>
  );
}
