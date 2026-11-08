import { NextResponse } from "next/server";
import { assertSameOrigin, handleApiError, jsonError } from "@/lib/api";
import { syncPrivyUser } from "@/lib/accounts";
import { attachSession } from "@/lib/session";
import { getDb } from "@/lib/db";
import { verifyPrivyAccessToken, verifyPrivyIdentityToken } from "@/lib/privy";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const authHeader = request.headers.get("authorization") ?? "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
    if (!token) return jsonError("A Privy access token is required.", 401);
    const verified = await verifyPrivyAccessToken(token);
    if (!verified) return jsonError("The Privy session is invalid or expired. Sign in again.", 401);

    let email: string | null = null;
    const identityHeader = request.headers.get("privy-id-token");
    if (identityHeader) {
      const identity = await verifyPrivyIdentityToken(identityHeader);
      if (identity && identity.did === verified.did) email = identity.email ?? null;
    }

    const account = syncPrivyUser(getDb(), verified.did, email);
    const response = NextResponse.json({
      ok: true,
      needsOnboarding: account.needsOnboarding,
      workspaceName: account.workspaceName,
    });
    return attachSession(response, {
      kind: "user",
      privyAccessToken: token,
      userId: account.userId,
      workspaceId: account.workspaceId,
      exp: verified.expiration ?? Math.floor(Date.now() / 1000) + 60 * 60,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
