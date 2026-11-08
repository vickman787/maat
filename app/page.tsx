import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
  FileSearch,
  LockKeyhole,
  ScanLine,
  ShieldCheck,
  Sparkles,
  Upload,
} from "lucide-react";
import { Logo } from "@/components/Logo";
import { getAuthContext } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function LandingPage() {
  const ctx = await getAuthContext();
  const openHref = ctx?.workspace ? "/dashboard" : ctx?.user ? "/onboarding" : null;

  return (
    <div className="landing">
      <header className="landing-nav">
        <Logo href="/" size={40} />
        <nav className="landing-nav-actions" aria-label="Account">
          {openHref ? (
            <Link href={openHref} className="button">
              Open dashboard <ArrowRight size={15} />
            </Link>
          ) : (
            <Link href="/login?next=%2Fdashboard" className="button">Sign in <ArrowRight size={15} /></Link>
          )}
        </nav>
      </header>

      <section className="hero">
        <div className="hero-copy">
          <div className="eyebrow">Reconciliation, with evidence</div>
          <h1>
            Know what&apos;s paid, what&apos;s missing, and <em>why.</em>
          </h1>
          <p className="hero-lede">
            Match invoice and payment CSVs. Review the exceptions with the original rows attached,
            then export a clear, traceable report.
          </p>
          <div className="hero-actions">
            {openHref ? (
              <Link href={openHref} className="button gold">
                Open dashboard <ArrowRight size={15} />
              </Link>
            ) : (
              <Link href="/login?next=%2Fdashboard" className="button gold">
                Sign in <ArrowRight size={15} />
              </Link>
            )}
            <Link href="#workflow" className="button secondary">How it works <ArrowRight size={15} /></Link>
          </div>
          <p className="hero-note">
            <LockKeyhole size={13} aria-hidden="true" /> Email one-time sign-in. No password, no wallet.
          </p>
        </div>

        <div className="hero-art" aria-label="Reconciliation workflow">
          <div className="mini-eyebrow">YOUR FILES · YOUR WORKSPACE</div>
          <h2>Two files. One clear record.</h2>
          <div className="hero-workflow">
            <div><Upload size={20} /><span><b>Import your CSVs</b><small>Invoices and payment records, stored privately.</small></span></div>
            <div><ScanLine size={20} /><span><b>Match the clear cases</b><small>Compare references, currencies and amounts.</small></span></div>
            <div><FileSearch size={20} /><span><b>Review with evidence</b><small>Original rows and AI explanations alongside your decision.</small></span></div>
            <div><CheckCircle2 size={20} /><span><b>Export a traceable report</b><small>Keep unresolved items and the review history visible.</small></span></div>
          </div>
        </div>
      </section>

      <section id="workflow" className="landing-section" aria-labelledby="workflow-heading">
        <div className="eyebrow">Three calm steps</div>
        <h2 id="workflow-heading" style={{ fontFamily: "var(--serif)", fontWeight: 400, fontSize: "1.9rem", marginBottom: "0.4rem" }}>
          From two CSVs to a defensible close.
        </h2>
        <p className="muted" style={{ marginBottom: "1.4rem", fontSize: "0.85rem" }}>
          Upload → validate → match → review → export. Every step leaves a record.
        </p>
        <div className="workflow-grid">
          <article className="workflow-card">
            <div className="workflow-step">01</div>
            <h3>Upload and map</h3>
            <p>Bring invoices and payments as CSV. Ma&apos;at previews the columns, validates every row, and refuses mixed currencies instead of guessing.</p>
          </article>
          <article className="workflow-card">
            <div className="workflow-step">02</div>
            <h3>Match with evidence</h3>
            <p>Exact reference, amount, and currency matches are allocated automatically. Partial and ambiguous cases carry their source rows, computed difference, and rule reason.</p>
          </article>
          <article className="workflow-card">
            <div className="workflow-step">03</div>
            <h3>Review and export</h3>
            <p>Confirm, reject, choose another payment, or leave it unresolved. Decisions are appended to an audit trail—never overwritten. Exports include the unresolved items honestly.</p>
          </article>
        </div>
      </section>

      <section className="privacy-band" aria-labelledby="privacy-heading">
        <div className="privacy-inner">
          <div>
            <div className="eyebrow" style={{ color: "#cfb579" }}>Privacy by design</div>
            <h2 id="privacy-heading">Your ledger stays yours.</h2>
            <p style={{ marginTop: "0.9rem" }}>
              Uploads are stored outside the public web root, scoped to your workspace, and never served
              as arbitrary files. The AI step receives only a small exception bundle—normalized fields,
              candidate row IDs, computed differences—not your whole CSV.
            </p>
          </div>
          <div className="privacy-points">
            <div className="privacy-point">
              <ShieldCheck size={17} aria-hidden="true" />
              <span>Privy sign-in is verified server-side. A client-supplied user or workspace ID is never accepted as proof of access.</span>
            </div>
            <div className="privacy-point">
              <ScanLine size={17} aria-hidden="true" />
              <span>Rules do the arithmetic. AI may explain and suggest, but it cannot change an allocation, amounts, or totals.</span>
            </div>
            <div className="privacy-point">
              <FileSearch size={17} aria-hidden="true" />
              <span>Every suggestion is labelled separately from system evidence and the human decision that follows.</span>
            </div>
            <div className="privacy-point">
              <Sparkles size={17} aria-hidden="true" />
              <span>If the AI provider is unconfigured or unavailable, deterministic reconciliation still works and the UI says so plainly.</span>
            </div>
          </div>
        </div>
      </section>

      <section className="landing-section" style={{ textAlign: "center" }}>
        <h2 style={{ fontFamily: "var(--serif)", fontWeight: 400, fontSize: "2rem" }}>Start with your own two files.</h2>
        <p className="muted" style={{ margin: "0.6rem auto 1.2rem", maxWidth: "52ch", fontSize: "0.85rem" }}>
          Your workspace starts empty. Upload your invoices and payment records to see your own
          matches, exceptions and reports.
        </p>
        <div className="row" style={{ justifyContent: "center" }}>
          <Link href={openHref ?? "/login?next=%2Fdashboard"} className="button">
            {openHref ? "Open dashboard" : "Sign in"} <ArrowRight size={15} />
          </Link>
        </div>
      </section>

      <footer className="landing-footer">
        <span>Ma&apos;at · Reconciliation workspace · Records, not money movement</span>
        <span>Built for review. No regulatory certification is claimed.</span>
      </footer>
    </div>
  );
}
