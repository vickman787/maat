import Link from "next/link";
import { Logo } from "@/components/Logo";

export default function NotFound() {
  return (
    <div className="onboarding-shell">
      <div className="onboarding-card" style={{ textAlign: "center" }}>
        <div style={{ display: "flex", justifyContent: "center", marginBottom: "1.2rem" }}>
          <Logo href="/" size={38} />
        </div>
        <div className="eyebrow">404 · Not found</div>
        <h1>This page is not in the ledger.</h1>
        <p className="muted" style={{ margin: "0.6rem 0 1.2rem", fontSize: "0.85rem" }}>
          The batch or page may have been deleted, or the link may belong to another workspace.
        </p>
        <Link href="/dashboard" className="button">Return to dashboard</Link>
      </div>
    </div>
  );
}
