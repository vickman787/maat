import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { getAuthContext } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/login");
  if (!ctx.workspace) redirect("/onboarding");

  const user = ctx.user
    ? {
        label: ctx.user.email ?? ctx.user.displayName ?? "Workspace member",
        email: ctx.user.email,
        role: ctx.role ?? "member",
      }
    : {
        label: "Demo visitor",
        email: null,
        role: "member",
      };

  return (
    <AppShell workspace={{ name: ctx.workspace.name, isDemo: ctx.workspace.isDemo }} user={user}>
      {children}
    </AppShell>
  );
}
