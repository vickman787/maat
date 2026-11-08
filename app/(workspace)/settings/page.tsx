import Link from "next/link";
import { ArrowRight, KeyRound, LockKeyhole, ShieldCheck, Sparkles } from "lucide-react";
import { requireWorkspaceContext } from "@/lib/auth";
import { listBatchSummaries } from "@/lib/batches";
import { aiConfig } from "@/lib/config";
import { getDb } from "@/lib/db";
import { BusinessNameForm } from "@/components/BusinessNameForm";
import { DeleteBatchButton } from "@/components/DeleteBatchButton";
import { LogoutButton } from "@/components/LogoutButton";

export const dynamic = "force-dynamic";
export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const ctx = await requireWorkspaceContext();
  const summaries = listBatchSummaries(getDb(), ctx.workspace.id);
  const ai = aiConfig();
  const providerHost = (() => {
    if (!ai.configured) return null;
    try {
      return new URL(ai.baseUrl).hostname;
    } catch {
      return "configured provider";
    }
  })();

  return (
    <>
      <div className="page-header">
        <div>
          <div className="breadcrumb">Workspace / Settings</div>
          <h1>Settings</h1>
          <p>Business identity, workspace privacy, and irreversible actions.</p>
        </div>
      </div>

      <div className="grid-2">
        <section className="panel">
          <div className="section-title">
            <div>
              <div className="eyebrow">Business</div>
              <h2>Workspace name</h2>
            </div>
          </div>
          <BusinessNameForm initialName={ctx.workspace.name} disabled={false} />
        </section>

        <section className="panel">
          <div className="section-title">
            <div>
              <div className="eyebrow">Identity</div>
              <h2>Signed-in account</h2>
            </div>
          </div>
          <div className="kv-list">
            <div>
              <dt>Workspace</dt>
              <dd>{ctx.workspace.name}</dd>
            </div>
            <div>
              <dt>Role</dt>
              <dd>{ctx.role === "owner" ? "Owner" : "Member"}</dd>
            </div>
            <div>
              <dt>Email</dt>
              <dd>{ctx.user?.email ?? "Not shared by Privy identity token"}</dd>
            </div>
            <div>
              <dt>Privy identity</dt>
              <dd className="hash">
                {ctx.user?.privyDid ?? "Not available"}
              </dd>
            </div>
          </div>
          <div className="separator" />
          <div className="row">
            <LogoutButton />
          </div>
          <p className="field-hint" style={{ marginTop: "0.6rem" }}>
            Signing out clears the local session cookie. The server never accepts a client-supplied user
            or workspace ID as proof of access.
          </p>
        </section>
      </div>

      <section className="panel" style={{ marginTop: "1.2rem" }}>
        <div className="section-title">
          <div>
            <div className="eyebrow">Privacy and processing</div>
            <h2>How this workspace handles your data</h2>
          </div>
        </div>
        <div className="grid-2 equal" style={{ marginBottom: 0 }}>
          <div className="stack">
            <div className="row" style={{ alignItems: "flex-start" }}>
              <LockKeyhole size={17} style={{ color: "var(--gold-deep)", flexShrink: 0 }} />
              <div>
                <b style={{ fontSize: "0.8rem" }}>Private file storage</b>
                <p className="small muted">
                  CSVs are stored outside the public directory under random names. Only authenticated
                  downloads and internal workers can read them.
                </p>
              </div>
            </div>
            <div className="row" style={{ alignItems: "flex-start" }}>
              <ShieldCheck size={17} style={{ color: "var(--gold-deep)", flexShrink: 0 }} />
              <div>
                <b style={{ fontSize: "0.8rem" }}>Workspace isolation</b>
                <p className="small muted">
                  Every batch, row, suggestion, allocation, decision, and export is scoped by verified
                  workspace membership.
                </p>
              </div>
            </div>
          </div>
          <div className="stack">
            <div className="row" style={{ alignItems: "flex-start" }}>
              <Sparkles size={17} style={{ color: "var(--gold-deep)", flexShrink: 0 }} />
              <div>
                <b style={{ fontSize: "0.8rem" }}>AI explanation status</b>
                <p className="small muted">
                  {ai.configured
                    ? `Configured: ${providerHost} · model ${ai.model}. Only exception bundles are sent; AI cannot mutate financial records.`
                    : "Not configured. Deterministic matching and exports still work; explanations are labelled rule-based only."}
                </p>
              </div>
            </div>
            <div className="row" style={{ alignItems: "flex-start" }}>
              <KeyRound size={17} style={{ color: "var(--gold-deep)", flexShrink: 0 }} />
              <div>
                <b style={{ fontSize: "0.8rem" }}>Secrets stay server-side</b>
                <p className="small muted">
                  API keys, session secrets, and provider credentials are read from server environment
                  variables only. They are never sent to the browser or written into the database.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="panel" style={{ marginTop: "1.2rem" }}>
        <div className="section-title">
          <div>
            <div className="eyebrow">Danger zone</div>
            <h2>Delete a reconciliation batch</h2>
            <p>Deletion removes private CSV files and every linked record. It cannot be undone.</p>
          </div>
        </div>
        {summaries.length === 0 ? (
          <p className="small muted">No batches to delete.</p>
        ) : (
          <div className="stack" style={{ gap: "0.7rem" }}>
            {summaries.map((summary) => (
              <div
                key={summary.id}
                className="row"
                style={{ borderBottom: "1px solid var(--border-soft)", paddingBottom: "0.7rem", alignItems: "flex-start" }}
              >
                <div style={{ flex: 1, minWidth: 220 }}>
                  <b style={{ fontSize: "0.82rem" }}>{summary.name}</b>
                  <small className="muted">
                    {summary.invoice_count} invoices · {summary.payment_count} payments
                  </small>
                  <Link href={`/batches/${summary.id}`} className="text-link" style={{ marginLeft: "0.6rem" }}>
                    Open <ArrowRight size={12} />
                  </Link>
                </div>
                <DeleteBatchButton batchId={summary.id} batchName={summary.name} />
              </div>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
