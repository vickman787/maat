"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowRight, LoaderCircle } from "lucide-react";

export function DemoButton({
  className = "button gold",
  label = "Explore demo",
}: {
  className?: string;
  label?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function startDemo() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/demo/start", { method: "POST" });
      const body = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(body.error ?? "The demo workspace could not be created.");
        setBusy(false);
        return;
      }
      router.push("/dashboard");
      router.refresh();
    } catch {
      setError("The demo workspace could not be created. Check your connection.");
      setBusy(false);
    }
  }

  return (
    <div style={{ display: "inline-flex", flexDirection: "column", gap: "0.4rem" }}>
      <button type="button" className={className} onClick={startDemo} disabled={busy}>
        {busy ? <LoaderCircle size={15} className="spin" /> : null}
        {busy ? "Opening demo…" : label}
        {!busy && <ArrowRight size={15} aria-hidden="true" />}
      </button>
      {error && (
        <span role="alert" className="small danger-text" style={{ maxWidth: 260 }}>
          {error}
        </span>
      )}
    </div>
  );
}
