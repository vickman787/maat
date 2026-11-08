import Link from "next/link";
import { redirect } from "next/navigation";
import { Logo } from "@/components/Logo";
import { OnboardingForm } from "@/components/OnboardingForm";
import { getAuthContext } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const metadata = { title: "Set up your workspace" };

export default async function OnboardingPage() {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/login");
  if (ctx.workspace) redirect("/dashboard");
  if (!ctx.user) redirect("/login");

  return (
    <div className="onboarding-shell">
      <div className="onboarding-card">
        <div style={{ marginBottom: "1.5rem" }}>
          <Logo href="/" size={36} />
        </div>
        <div className="eyebrow">One last step</div>
        <h1>Name your workspace.</h1>
        <p className="muted" style={{ margin: "0.5rem 0 1.5rem", fontSize: "0.85rem" }}>
          This creates one owner workspace, tied to your verified Privy identity. It is private to you
          and cannot be reached from another account.
        </p>
        <OnboardingForm suggestedName={ctx.user.email?.split("@")[0]?.replace(/[._-]/g, " ") ?? ""} />
        <hr className="divider" />
        <div className="small muted">
          Signed in as <strong>{ctx.user.email ?? "verified Privy identity"}</strong>
          {!ctx.user.email && <div className="hash">{ctx.user.privyDid}</div>}
        </div>
        <div style={{ marginTop: "1rem" }}>
          <Link href="/" className="text-link">
            ← Back to landing page
          </Link>
        </div>
      </div>
    </div>
  );
}
