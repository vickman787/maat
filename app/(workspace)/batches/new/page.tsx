import Link from "next/link";
import { UploadWizard } from "@/components/UploadWizard";
import { Stepper } from "@/components/Stepper";
import { requireWorkspaceContext } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const metadata = { title: "New reconciliation" };

export default async function NewBatchPage() {
  const ctx = await requireWorkspaceContext();

  if (ctx.workspace.isDemo) {
    return (
      <>
        <div className="breadcrumb">Workspace / Reconciliations / New batch</div>
        <div className="page-header">
          <div>
            <h1>Uploads are off in the demo.</h1>
            <p>The demo is an isolated sample workspace. Personal CSV uploads are disabled so nobody can place real data in a public demo.</p>
          </div>
        </div>
        <div className="empty-state">
          <h2>Use the sample batch instead.</h2>
          <p>Review evidence, confirm the partial payment, undo a decision, and export the report. Sign in with email when you are ready to upload your own files.</p>
          <div className="row" style={{ justifyContent: "center" }}>
            <Link href="/dashboard" className="button">
              Open demo dashboard
            </Link>
            <Link href="/login" className="button secondary">
              Sign in
            </Link>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="breadcrumb">Workspace / Reconciliations / New batch</div>
      <div className="page-header">
        <div>
          <h1>Start with your source files.</h1>
          <p>Upload invoices and payments. Ma&apos;at validates the columns and every row before matching.</p>
        </div>
      </div>
      <Stepper current={1} />
      <div className="notice" style={{ marginBottom: "1.1rem" }}>
        <strong>Privacy note.</strong> Files are stored privately for this workspace. If an AI provider is
        configured, only a small exception bundle (normalized fields, candidate row IDs, computed
        differences) is sent for explanation—never the whole file. The AI cannot change allocations.
      </div>
      <UploadWizard />
    </>
  );
}
