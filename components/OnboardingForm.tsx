"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowRight, LoaderCircle } from "lucide-react";

export function OnboardingForm({
  suggestedName = "",
  nextPath = "/dashboard",
}: {
  suggestedName?: string;
  nextPath?: string;
}) {
  const router = useRouter();
  const [name, setName] = useState(suggestedName);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessName: name }),
      });
      const body = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(body.error ?? "Your workspace could not be created.");
        setBusy(false);
        return;
      }
      router.replace(nextPath);
      router.refresh();
    } catch {
      setError("Your workspace could not be created. Check your connection.");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="stack" noValidate>
      {error && (
        <div className="form-error" role="alert">
          {error}
        </div>
      )}
      <div className="field">
        <label htmlFor="business-name">Business display name</label>
        <input
          id="business-name"
          className="input"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Your business name"
          maxLength={120}
          required
          autoFocus
          aria-describedby="business-hint"
        />
        <span className="field-hint" id="business-hint">
          Shown in the workspace and on exported reports. You can change it later in Settings.
        </span>
      </div>
      <button type="submit" className="button wide" disabled={busy || !name.trim()}>
        {busy ? <LoaderCircle size={15} className="spin" /> : null}
        {busy ? "Creating workspace…" : "Create private workspace"}
        {!busy && <ArrowRight size={15} />}
      </button>
    </form>
  );
}
