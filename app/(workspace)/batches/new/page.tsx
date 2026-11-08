import { UploadWizard } from "@/components/UploadWizard";
import { Stepper } from "@/components/Stepper";
import { requireWorkspaceContext } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const metadata = { title: "New reconciliation" };

export default async function NewBatchPage() {
  await requireWorkspaceContext();

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
