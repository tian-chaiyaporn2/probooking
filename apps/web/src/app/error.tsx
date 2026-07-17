"use client";

import { useEffect } from "react";
import { Button } from "../components/Button";

/**
 * Route-level recovery UI. Without this, an uncaught render error white-screens the
 * whole App Router tree with no way back.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="page" style={{ maxWidth: 480, textAlign: "center", paddingTop: "var(--s8)" }}>
      <h1 style={{ marginBottom: "var(--s3)" }}>เกิดข้อผิดพลาด</h1>
      <p style={{ color: "var(--muted)", marginBottom: "var(--s5)" }}>
        ไม่สามารถแสดงหน้านี้ได้ชั่วคราว กรุณาลองใหม่อีกครั้ง
      </p>
      <Button variant="primary" onClick={() => reset()}>
        ลองอีกครั้ง
      </Button>
    </main>
  );
}
