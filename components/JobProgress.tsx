"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, LoaderCircle, RefreshCcw, RotateCcw } from "lucide-react";

type JobState = {
  id: string;
  status: string;
  stage: string;
  progress: number;
  message: string | null;
  error: string | null;
  retry_count: number;
  max_retries: number;
};

const STAGE_LABEL: Record<string, string> = {
  queued: "Waiting for the worker",
  validating: "Validating source rows",
  matching: "Running deterministic matching",
  explaining: "Preparing exception explanations",
  completed: "Reconciliation complete",
  failed: "Reconciliation failed",
};

export function JobProgress({
  batchId,
  initialJob,
}: {
  batchId: string;
  initialJob: JobState | null;
}) {
  const router = useRouter();
  const [job, setJob] = useState<JobState | null>(initialJob);
  const [busy, setBusy] = useState(false);
  const [pollError, setPollError] = useState(false);
  const lastStatus = useRef(initialJob?.status ?? "");

  const active = job && ["queued", "validating", "matching", "explaining"].includes(job.status);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    const timer = setInterval(async () => {
      try {
        const response = await fetch(`/api/batches/${batchId}/status`, { cache: "no-store" });
        if (!response.ok) return;
        const body = (await response.json()) as { job: JobState | null };
        if (cancelled || !body.job) return;
        setJob(body.job);
        setPollError(false);
        const terminal = body.job.status === "completed" || body.job.status === "failed";
        if (terminal && lastStatus.current !== body.job.status) {
          lastStatus.current = body.job.status;
          router.refresh();
        }
      } catch {
        if (!cancelled) setPollError(true);
      }
    }, 1200);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [active, batchId, router]);

  if (!job) return null;

  if (job.status === "completed") {
    return (
      <div className="row" style={{ justifyContent: "flex-end", marginBottom: "0.6rem" }}>
        <RerunButton batchId={batchId} />
      </div>
    );
  }

  async function retry() {
    setBusy(true);
    await fetch(`/api/batches/${batchId}/retry`, { method: "POST" });
    setBusy(false);
    router.refresh();
  }

  if (job.status === "failed") {
    return (
      <div className="job-card job-error" role="alert">
        <div className="row" style={{ alignItems: "flex-start" }}>
          <AlertCircle size={18} style={{ color: "var(--danger)", flexShrink: 0, marginTop: 2 }} />
          <div style={{ flex: 1 }}>
            <h2>Reconciliation did not finish.</h2>
            <p className="job-stage">
              {job.error ?? "The worker stopped before completing this job."}
            </p>
            <p className="job-stage">
              Deterministic results that were already committed are preserved. You can retry without
              double-allocating payments.
            </p>
          </div>
        </div>
        <div className="row" style={{ marginTop: "0.8rem" }}>
          <button type="button" className="button small-button" onClick={retry} disabled={busy || job.retry_count >= job.max_retries}>
            {busy ? <LoaderCircle size={14} className="spin" /> : <RefreshCcw size={14} />}
            {job.retry_count >= job.max_retries ? "Retry limit reached" : "Retry reconciliation"}
          </button>
          <span className="small muted">
            Attempt {job.retry_count + 1} of {job.max_retries + 1}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="job-card" aria-live="polite">
      <div className="row">
        <LoaderCircle size={17} className="spin" style={{ color: "var(--gold-deep)" }} />
        <h2 style={{ flex: 1 }}>{STAGE_LABEL[job.status] ?? job.stage}</h2>
        <span className="small muted">{job.progress}%</span>
      </div>
      <div className="progress-track" aria-hidden="true">
        <span style={{ width: `${Math.max(4, job.progress)}%` }} />
      </div>
      <p className="job-stage">{job.message ?? "Working…"}</p>
      {pollError && (
        <p className="job-stage danger-text">Live status is temporarily unavailable. Retrying…</p>
      )}
    </div>
  );
}

function RerunButton({ batchId }: { batchId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function rerun() {
    setBusy(true);
    setMessage(null);
    const response = await fetch(`/api/batches/${batchId}/rerun`, { method: "POST" });
    const body = (await response.json()) as { error?: string };
    setBusy(false);
    if (!response.ok) {
      setMessage(body.error ?? "Matching could not be rerun.");
      return;
    }
    router.refresh();
  }

  return (
    <div className="row" style={{ gap: "0.5rem" }}>
      {message && <span className="small danger-text">{message}</span>}
      <button type="button" className="button secondary small-button" onClick={rerun} disabled={busy}>
        {busy ? <LoaderCircle size={14} className="spin" /> : <RotateCcw size={14} />}
        {busy ? "Queueing…" : "Rerun matching"}
      </button>
    </div>
  );
}
