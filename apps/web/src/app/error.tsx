"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AppHeader } from "../components/AppHeader";
import { Button } from "../components/Button";
import { th } from "../lib/strings";

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
    <>
      <AppHeader />
      <main id="main" className="page">
        <div className="not-found">
          <h1>{th.errors.pageTitle}</h1>
          <p className="lead muted">{th.errors.pageBody}</p>
          <div className="actions" style={{ justifyContent: "center" }}>
            <Button variant="primary" onClick={() => reset()}>
              {th.errors.retry}
            </Button>
            <Link href="/" className="btn btn--subtle">
              {th.notFound.home}
            </Link>
          </div>
        </div>
      </main>
    </>
  );
}
