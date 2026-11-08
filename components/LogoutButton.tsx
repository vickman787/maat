"use client";

import { usePrivy } from "@privy-io/react-auth";
import { useState } from "react";
import { LogOut } from "lucide-react";

export function LogoutButton() {
  const { logout, authenticated } = usePrivy();
  const [busy, setBusy] = useState(false);

  async function signOut() {
    setBusy(true);
    try {
      if (authenticated) await logout();
    } catch {
      // The server session clear below is authoritative.
    }
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.assign("/login");
  }

  return (
    <button type="button" className="button secondary" onClick={signOut} disabled={busy}>
      <LogOut size={15} /> {busy ? "Signing out…" : "Sign out"}
    </button>
  );
}
