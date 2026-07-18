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
    <main className="page page--gate">
      <h1>เกิดข้อผิดพลาด</h1>
      <p className="muted page--gate__lead">ไม่สามารถแสดงหน้านี้ได้ชั่วคราว กรุณาลองใหม่อีกครั้ง</p>
      <Button variant="primary" onClick={() => reset()}>
        ลองอีกครั้ง
      </Button>
    </main>
  );
}
