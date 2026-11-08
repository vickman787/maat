"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useIdentityToken, usePrivy } from "@privy-io/react-auth";
import { ArrowRight, LoaderCircle, Mail, ShieldCheck } from "lucide-react";
import { DemoButton } from "./DemoButton";

export function LoginPanel() {
  const router = useRouter();
  const { ready, authenticated, login, getAccessToken } = usePrivy();
  const { identityToken } = useIdentityToken();
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [retryNonce, setRetryNonce] = useState(0);
  const syncingRef = useRef(false);
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;

  useEffect(() => {
    if (!ready || !authenticated || syncingRef.current) return;
    let cancelled = false;
    async function sync() {
      syncingRef.current = true;
      setSyncing(true);
      setError(null);
      try {
        const token = await getAccessToken();
        const response = await fetch("/api/auth/sync", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token ?? ""}`,
            ...(identityToken ? { "privy-id-token": identityToken } : {}),
          },
        });
        const body = (await response.json()) as {
          error?: string;
          needsOnboarding?: boolean;
        };
        if (!response.ok) {
          if (!cancelled) setError(body.error ?? "Sign-in could not be verified. Try again.");
          syncingRef.current = false;
          setSyncing(false);
          return;
        }
        router.replace(body.needsOnboarding ? "/onboarding" : "/dashboard");
        router.refresh();
      } catch {
        if (!cancelled) {
          setError("The sign-in service could not be reached. Check your connection and retry.");
          syncingRef.current = false;
          setSyncing(false);
        }
      }
    }
    void sync();
    return () => {
      cancelled = true;
    };
  }, [ready, authenticated, getAccessToken, identityToken, router, retryNonce]);

  return (
    <div className="auth-card">
      <div className="eyebrow">Secure workspace</div>
      <h1>Sign in with email.</h1>
      <p>
        Ma&apos;at uses a six-digit one-time code. There is no password to remember, reset, or leak.
      </p>

      {!appId && (
        <div className="auth-error" role="alert">
          Privy is not configured. Set <code>NEXT_PUBLIC_PRIVY_APP_ID</code> before using sign-in.
        </div>
      )}

      {error && (
        <div className="auth-error" role="alert">
          {error}
        </div>
      )}

      {syncing ? (
        <div className="form-note" role="status">
          <LoaderCircle size={16} className="spin" /> Verifying your Privy session with the server…
        </div>
      ) : authenticated ? (
        <button
          type="button"
          className="button wide"
          onClick={() => {
            syncingRef.current = false;
            setError(null);
            setRetryNonce((value) => value + 1);
          }}
          disabled={!ready}
        >
          Retry verification <ArrowRight size={15} />
        </button>
      ) : (
        <button type="button" className="button wide" onClick={() => login()} disabled={!ready || !appId}>
          <Mail size={15} /> {ready ? "Continue with email" : "Preparing sign-in…"}
        </button>
      )}

      <div className="auth-states">
        <div className="row" style={{ gap: "0.4rem", alignItems: "flex-start" }}>
          <ShieldCheck size={14} aria-hidden="true" />
          <span>The code expires. If it does not arrive, request a resend from the sign-in window.</span>
        </div>
        <div style={{ marginTop: "0.7rem" }}>
          Wrong or expired codes are rejected by Privy; no account is created until verification succeeds.
        </div>
      </div>

      <div className="separator" />
      <p className="small muted" style={{ marginBottom: "0.6rem" }}>
        Just looking? Open the isolated demo workspace—no account required.
      </p>
      <DemoButton className="button secondary wide" label="Explore demo" />
      <p className="small muted" style={{ marginTop: "1rem" }}>
        Signing in? After verification you&apos;ll name your business once. Ma&apos;at creates a private
        workspace; repeated sign-ins never create duplicates.
      </p>
    </div>
  );
}
