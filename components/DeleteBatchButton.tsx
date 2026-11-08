"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { AlertTriangle, LoaderCircle, Trash2 } from "lucide-react";

export function DeleteBatchButton({
  batchId,
  batchName,
}: {
  batchId: string;
  batchName: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    setBusy(true);
    setError(null);
    const response = await fetch(`/api/batches/${batchId}`, { method: "DELETE" });
    const body = (await response.json()) as { error?: string };
    if (!response.ok) {
      setError(body.error ?? "The batch could not be deleted.");
      setBusy(false);
      return;
    }
    router.push("/batches");
    router.refresh();
  }

  if (!open) {
    return (
      <button type="button" className="button danger small-button" onClick={() => setOpen(true)}>
        <Trash2 size={13} /> Delete
      </button>
    );
  }

  return (
    <div className="notice" style={{ marginTop: "0.5rem" }}>
      <div className="row" style={{ alignItems: "flex-start", marginBottom: "0.5rem" }}>
        <AlertTriangle size={15} style={{ flexShrink: 0, marginTop: 2, color: "var(--danger)" }} />
        <span>
          Deleting <strong>{batchName}</strong> is permanent. It removes the private source files,
          rows, suggestions, allocations, decisions, and report metadata for this batch.
        </span>
      </div>
      <div className="field" style={{ marginBottom: "0.5rem" }}>
        <label htmlFor={`confirm-${batchId}`}>Type the batch name to confirm</label>
        <input
          id={`confirm-${batchId}`}
          className="input"
          value={confirmText}
          onChange={(event) => setConfirmText(event.target.value)}
          autoComplete="off"
        />
      </div>
      {error && <div className="form-error" role="alert" style={{ marginBottom: "0.5rem" }}>{error}</div>}
      <div className="row">
        <button
          type="button"
          className="button danger small-button"
          disabled={busy || confirmText !== batchName}
          onClick={remove}
        >
          {busy ? <LoaderCircle size={13} className="spin" /> : <Trash2 size={13} />}
          {busy ? "Deleting…" : "Delete permanently"}
        </button>
        <button
          type="button"
          className="button secondary small-button"
          onClick={() => {
            setOpen(false);
            setConfirmText("");
            setError(null);
          }}
          disabled={busy}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
