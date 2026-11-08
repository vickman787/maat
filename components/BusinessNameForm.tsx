"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { LoaderCircle, Save } from "lucide-react";

export function BusinessNameForm({ initialName, disabled }: { initialName: string; disabled: boolean }) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);
    const response = await fetch("/api/workspace", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ businessName: name }),
    });
    const body = (await response.json()) as { error?: string };
    setBusy(false);
    if (!response.ok) {
      setError(body.error ?? "The business name could not be saved.");
      return;
    }
    setMessage("Business name saved.");
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="stack" noValidate>
      {disabled && (
        <div className="form-note">
          Workspace settings are unavailable.
        </div>
      )}
      {message && <div className="form-note" role="status">{message}</div>}
      {error && <div className="form-error" role="alert">{error}</div>}
      <div className="field">
        <label htmlFor="settings-business-name">Business display name</label>
        <input
          id="settings-business-name"
          className="input"
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={120}
          disabled={disabled}
        />
      </div>
      <div>
        <button type="submit" className="button" disabled={disabled || busy || !name.trim() || name === initialName}>
          {busy ? <LoaderCircle size={15} className="spin" /> : <Save size={15} />}
          {busy ? "Saving…" : "Save business name"}
        </button>
      </div>
    </form>
  );
}
