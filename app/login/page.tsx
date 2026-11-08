import Link from "next/link";
import { redirect } from "next/navigation";
import { Logo } from "@/components/Logo";
import { LoginPanel } from "@/components/LoginPanel";
import { getAuthContext } from "@/lib/auth";
import { safePostAuthPath } from "@/lib/navigation";

export const dynamic = "force-dynamic";

export const metadata = { title: "Sign in" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const query = await searchParams;
  const nextPath = safePostAuthPath(query.next);
  const ctx = await getAuthContext();
  if (ctx?.workspace) redirect(nextPath);
  if (ctx?.user) redirect(`/onboarding?next=${encodeURIComponent(nextPath)}`);

  return (
    <div className="auth-page">
      <aside className="auth-aside">
        <Logo href="/" light size={36} />
        <div>
          <div className="eyebrow" style={{ color: "#96a4af" }}>Reconciliation workspace</div>
          <p className="auth-quote">
            Every balance deserves a <em>traceable</em> answer.
          </p>
        </div>
        <small>
          Records, not money movement. Uploads stay private to your workspace. Ma&apos;at never claims
          a match beyond the evidence in your files.
        </small>
      </aside>
      <main className="auth-main">
        <LoginPanel nextPath={nextPath} />
      </main>
      <div style={{ position: "fixed", bottom: "1rem", left: "50%", transform: "translateX(-50%)" }}>
        <Link href="/" className="text-link">
          ← Back to Ma&apos;at
        </Link>
      </div>
    </div>
  );
}
