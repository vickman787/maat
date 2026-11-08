"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  LayoutDashboard,
  ArrowLeftRight,
  FileBarChart,
  Settings,
  Sparkles,
  Menu,
  X,
  ChevronDown,
  LogOut,
  RotateCcw,
  House,
} from "lucide-react";
import { usePrivy } from "@privy-io/react-auth";
import { Logo } from "./Logo";
import type { ShellUser, ShellWorkspace } from "./shell-types";

const NAV = [
  { href: "/", label: "Home", icon: House },
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/batches", label: "Reconciliations", icon: ArrowLeftRight },
  { href: "/reports", label: "Reports", icon: FileBarChart },
  { href: "/settings", label: "Settings", icon: Settings },
];

function initials(label: string): string {
  const parts = label
    .replace(/@.*$/, "")
    .split(/[\s._-]+/)
    .filter(Boolean);
  if (parts.length === 0) return "M";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0]}${parts[1]![0]}`.toUpperCase();
}

function SidebarBody({
  workspace,
  user,
  pathname,
}: {
  workspace: ShellWorkspace;
  user: ShellUser;
  pathname: string;
}) {
  return (
    <>
      <div className="sidebar-logo">
        <Logo href="/dashboard" light />
      </div>
      <div className="workspace-card">
        <span className="avatar">{initials(workspace.name)}</span>
        <div>
          <b title={workspace.name}>{workspace.name}</b>
          <small>{workspace.isDemo ? "Demo workspace" : "Finance workspace"}</small>
        </div>
      </div>
      <div className="eyebrow">Workspace</div>
      <nav className="nav-list" aria-label="Workspace">
        {NAV.map((item) => {
          const Icon = item.icon;
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`nav-item${active ? " active" : ""}`}
              aria-current={active ? "page" : undefined}
            >
              <Icon size={17} aria-hidden="true" />
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="sidebar-note">
        <Sparkles size={20} aria-hidden="true" />
        <h3>Clarity, in every balance.</h3>
        <p>Match the facts. Review with confidence.</p>
      </div>
      <div className="sidebar-profile">
        <div className="profile-trigger" style={{ cursor: "default" }}>
          <span className="avatar light">{initials(user.label)}</span>
          <div>
            <b title={user.email ?? user.label}>{user.email ?? user.label}</b>
            <small>
              {workspace.isDemo ? "Demo visitor" : user.role === "owner" ? "Workspace owner" : "Workspace member"}
            </small>
          </div>
        </div>
      </div>
    </>
  );
}

export function ShellChrome({
  workspace,
  user,
  children,
}: {
  workspace: ShellWorkspace;
  user: ShellUser;
  children: React.ReactNode;
}) {
  const pathname = usePathname() || "";
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [demoError, setDemoError] = useState<string | null>(null);
  const { logout, authenticated } = usePrivy();

  useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);

  async function handleLogout() {
    setBusy(true);
    try {
      if (authenticated) {
        await logout();
      }
    } catch {
      // Clearing the server session below is the authoritative sign-out.
    }
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.assign(workspace.isDemo ? "/" : "/login");
  }

  async function handleResetDemo() {
    setBusy(true);
    setDemoError(null);
    try {
      const response = await fetch("/api/demo/reset", { method: "POST" });
      if (response.ok) {
        window.location.assign("/dashboard");
        return;
      }
      const body = (await response.json()) as { error?: string };
      setDemoError(body.error ?? "The demo could not be reset.");
    } catch {
      setDemoError("The demo could not be reset. Check your connection.");
    }
    setBusy(false);
  }

  return (
    <div className="shell">
      <aside className="sidebar">
        <SidebarBody workspace={workspace} user={user} pathname={pathname} />
      </aside>

      <div className="main-area">
        <div className="mobile-header">
          <button
            type="button"
            className="icon-button"
            style={{ color: "#fff" }}
            aria-label="Open navigation"
            aria-expanded={drawerOpen}
            onClick={() => setDrawerOpen(true)}
          >
            <Menu size={22} />
          </button>
          <Logo href="/dashboard" light size={30} />
          <span className="avatar light">{initials(user.label)}</span>
        </div>

        <div className="topbar">
          <div className="topbar-left">
            <span>Finance operations</span>
            {workspace.isDemo && <span className="demo-badge">DEMO DATA</span>}
          </div>
          <div className="topbar-right">
            <div className="topbar-identity">
              <span className="avatar light">{initials(user.label)}</span>
              <span>{workspace.isDemo ? "Demo visitor" : user.email ?? user.label}</span>
            </div>
            <details className="profile-menu">
              <summary className="icon-button" aria-label="Open profile menu">
                <ChevronDown size={18} />
              </summary>
              <div className="profile-popover">
                <div className="identity">
                  <b>{workspace.name}</b>
                  <small>{user.email ?? user.label}</small>
                </div>
                <Link href="/" className="popover-link">
                  <House size={15} /> Public homepage
                </Link>
                <Link href="/settings" className="popover-link">
                  <Settings size={15} /> Settings
                </Link>
                <button type="button" className="popover-button" onClick={handleLogout} disabled={busy}>
                  <LogOut size={15} /> {busy ? "Signing out…" : workspace.isDemo ? "Exit demo" : "Sign out"}
                </button>
              </div>
            </details>
          </div>
        </div>

        {workspace.isDemo && (
          <div className="demo-strip">
            <span>
              This is an isolated demo workspace with fictional sample data.
              {demoError && (
                <strong role="alert" style={{ marginLeft: "0.6rem", color: "var(--danger)" }}>
                  {demoError}
                </strong>
              )}
            </span>
            <div className="demo-strip-actions">
              <button type="button" onClick={handleResetDemo} disabled={busy}>
                <RotateCcw size={12} style={{ display: "inline", marginRight: 4 }} />
                Reset demo
              </button>
              <button type="button" onClick={handleLogout} disabled={busy}>
                Exit demo
              </button>
            </div>
          </div>
        )}

        <main className="content">{children}</main>
      </div>

      {drawerOpen && (
        <>
          <button
            type="button"
            className="drawer-backdrop"
            aria-label="Close navigation"
            onClick={() => setDrawerOpen(false)}
          />
          <aside className="drawer" aria-label="Mobile navigation">
            <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "0.5rem" }}>
              <button
                type="button"
                className="icon-button"
                style={{ color: "#fff" }}
                aria-label="Close navigation"
                onClick={() => setDrawerOpen(false)}
              >
                <X size={20} />
              </button>
            </div>
            <SidebarBody workspace={workspace} user={user} pathname={pathname} />
            <Link href="/" className="popover-link" style={{ color: "#e7e8e6" }}>
              <House size={15} /> Public homepage
            </Link>
            <button type="button" className="popover-button" style={{ color: "#e7e8e6", marginTop: "0.5rem" }} onClick={handleLogout}>
              <LogOut size={15} /> {workspace.isDemo ? "Exit demo" : "Sign out"}
            </button>
          </aside>
        </>
      )}
    </div>
  );
}


