import { CheckCircle2, Circle, HelpCircle, AlertTriangle } from "lucide-react";
import type { InvoiceStatus } from "@/lib/types";

const STATUS: Record<
  InvoiceStatus,
  { label: string; className: string; Icon: typeof CheckCircle2 }
> = {
  exact: { label: "Exact match", className: "pill", Icon: CheckCircle2 },
  settled: { label: "Settled", className: "pill", Icon: CheckCircle2 },
  partial: { label: "Partial payment", className: "pill amber", Icon: AlertTriangle },
  unpaid: { label: "Unpaid", className: "pill gray", Icon: Circle },
  ambiguous: { label: "Ambiguous", className: "pill purple", Icon: HelpCircle },
};

export function StatusPill({ status }: { status: InvoiceStatus }) {
  const config = STATUS[status];
  const Icon = config.Icon;
  return (
    <span className={config.className}>
      <Icon size={11} aria-hidden="true" /> {config.label}
    </span>
  );
}

export function ReviewFlag({ state }: { state: string }) {
  if (state === "needs_review") {
    return <span className="review-flag">Needs review</span>;
  }
  if (state === "unresolved") {
    return <span className="review-flag unresolved">Left unresolved</span>;
  }
  if (state === "confirmed") {
    return <span className="review-flag" style={{ color: "var(--green)" }}>Human-reviewed</span>;
  }
  if (state === "auto_confirmed") {
    return <span className="review-flag" style={{ color: "var(--muted)" }}>System rule</span>;
  }
  return null;
}

export function BatchStatusPill({ status }: { status: string }) {
  if (status === "completed") return <span className="pill">Report ready</span>;
  if (status === "failed") return <span className="pill red">Job failed</span>;
  if (status === "queued" || status === "processing") return <span className="pill amber">Processing</span>;
  return <span className="pill gray">Imported</span>;
}

