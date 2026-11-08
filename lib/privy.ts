import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";
import { privyAppId } from "./config";

const jwksCache = new Map<string, JWTVerifyGetKey>();

export function privyJwks(appId = privyAppId()): JWTVerifyGetKey {
  const cached = jwksCache.get(appId);
  if (cached) return cached;
  const jwks = createRemoteJWKSet(new URL(`https://auth.privy.io/api/v1/apps/${appId}/jwks.json`));
  jwksCache.set(appId, jwks);
  return jwks;
}

export type VerifiedPrivyUser = {
  did: string;
  sessionId?: string;
  email?: string;
  issuedAt?: number;
  expiration?: number;
};

export async function verifyPrivyAccessToken(
  token: string,
  appId = privyAppId(),
  jwks: JWTVerifyGetKey = privyJwks(appId),
): Promise<VerifiedPrivyUser | null> {
  if (!token || !appId) return null;
  try {
    const { payload } = await jwtVerify(token, jwks, {
      issuer: "privy.io",
      audience: appId,
      algorithms: ["ES256"],
    });
    if (typeof payload.sub !== "string" || !payload.sub.startsWith("did:privy:")) return null;
    return {
      did: payload.sub,
      sessionId: typeof payload.sid === "string" ? payload.sid : undefined,
      issuedAt: payload.iat,
      expiration: payload.exp,
    };
  } catch {
    return null;
  }
}

export async function verifyPrivyIdentityToken(
  token: string,
  appId = privyAppId(),
  jwks: JWTVerifyGetKey = privyJwks(appId),
): Promise<VerifiedPrivyUser | null> {
  if (!token || !appId) return null;
  try {
    const { payload } = await jwtVerify(token, jwks, {
      issuer: "privy.io",
      audience: appId,
      algorithms: ["ES256"],
    });
    if (typeof payload.sub !== "string" || !payload.sub.startsWith("did:privy:")) return null;
    let email: string | undefined;
    if (typeof payload.linked_accounts === "string") {
      try {
        const accounts = JSON.parse(payload.linked_accounts) as Array<{
          type?: string;
          address?: string;
        }>;
        const emailAccount = accounts.find((account) => account.type === "email");
        if (emailAccount?.address) email = emailAccount.address;
      } catch {
        // Identity token claim malformed; use the verified DID only.
      }
    }
    return { did: payload.sub, email };
  } catch {
    return null;
  }
}
