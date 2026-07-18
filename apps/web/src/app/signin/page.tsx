"use client";

import { useState } from "react";
import { AppHeader } from "../../components/AppHeader";
import { PageHeader } from "../../components/PageHeader";
import { RolePicker } from "../../components/RolePicker";
import { useToast } from "../../components/Toast";
import { resetDemo } from "../../lib/api";
import { getThaiErrorMessage } from "../../lib/strings";
import { clearSession } from "../../lib/demo-accounts";

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
      toast.success("รีเซ็ตข้อมูลเดโมแล้ว");
    } catch (e) {
      toast.error(getThaiErrorMessage(e));
    } finally {
      setResetting(false);
    }
  }

  return (
    <>
      <AppHeader current="/signin" />
      <main className="page page--signin">
        <PageHeader
          title="เข้าใช้งานในบทบาทต่าง ๆ"
          subtitle="เลือกบัญชีทดลองเพื่อเข้าใช้งานในมุมมองของแต่ละบทบาท"
        />
        <RolePicker />
        <div className="signin-foot actions">
          <p className="muted signin-foot__hint">
            บัญชีทดลองสำหรับเดโมเท่านั้น (โหมด AUTH_DEV_MODE) — รหัส OTP จะกรอกให้อัตโนมัติ
          </p>
          <button
            type="button"
            className="btn btn--subtle"
            data-testid="reset-demo"
            disabled={resetting}
            onClick={() => void onReset()}
          >
            {resetting ? "กำลังรีเซ็ต…" : "รีเซ็ตข้อมูลเดโม"}
          </button>
        </div>
      </main>
    </>
  );
}
