"use client";

import Link from "next/link";
import { useEffect } from "react";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // Avoid logging uploaded rows or tokens; only the generic message.
    console.error("[maat] unexpected page error", error.message);
  }, [error]);
  return (
    <div className="onboarding-shell">
      <div className="onboarding-card">
        <div className="eyebrow">Something interrupted</div>
        <h1>Ma&apos;at could not finish this view.</h1>
        <p className="muted" style={{ margin: "0.6rem 0 1.2rem", fontSize: "0.85rem" }}>
          Your saved data is not affected. Retry the page, or return to the dashboard.
        </p>
        <div className="row">
          <button type="button" className="button" onClick={reset}>Retry</button>
          <Link href="/dashboard" className="button secondary">Dashboard</Link>
        </div>
      </div>
    </div>
  );
}
