import { describe, expect, it } from "vitest";
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from "jose";
import { verifyPrivyAccessToken, verifyPrivyIdentityToken } from "../lib/privy";

async function keySet() {
  const { privateKey, publicKey } = await generateKeyPair("ES256");
  const jwk = await exportJWK(publicKey);
  jwk.kid = "test-key";
  jwk.alg = "ES256";
  jwk.use = "sig";
  return { privateKey, jwks: createLocalJWKSet({ keys: [jwk] }) };
}

describe("Privy server verification", () => {
  it("verifies a correctly signed access token using JWKS", async () => {
    const { privateKey, jwks } = await keySet();
    const token = await new SignJWT({ sid: "session-1" })
      .setProtectedHeader({ alg: "ES256", kid: "test-key" })
      .setIssuer("privy.io")
      .setAudience("test-app-id")
      .setSubject("did:privy:abc123")
      .setIssuedAt()
      .setExpirationTime("1h")
      .sign(privateKey);
    const verified = await verifyPrivyAccessToken(token, "test-app-id", jwks);
    expect(verified?.did).toBe("did:privy:abc123");
    expect(verified?.sessionId).toBe("session-1");
  });

  it("rejects wrong audience, wrong issuer, expired tokens, and non-Privy subjects", async () => {
    const { privateKey, jwks } = await keySet();
    const base = () =>
      new SignJWT({})
        .setProtectedHeader({ alg: "ES256", kid: "test-key" })
        .setIssuer("privy.io")
        .setAudience("test-app-id")
        .setSubject("did:privy:abc123")
        .setIssuedAt()
        .setExpirationTime("1h");
    expect(await verifyPrivyAccessToken(await base().setAudience("other-app").sign(privateKey), "test-app-id", jwks)).toBeNull();
    expect(await verifyPrivyAccessToken(await base().setIssuer("not-privy").sign(privateKey), "test-app-id", jwks)).toBeNull();
    expect(
      await verifyPrivyAccessToken(
        await base().setIssuedAt(Math.floor(Date.now() / 1000) - 7200).setExpirationTime(Math.floor(Date.now() / 1000) - 3600).sign(privateKey),
        "test-app-id",
        jwks,
      ),
    ).toBeNull();
    expect(await verifyPrivyAccessToken(await base().setSubject("user-123").sign(privateKey), "test-app-id", jwks)).toBeNull();
  });

  it("extracts a verified email from identity-token linked accounts", async () => {
    const { privateKey, jwks } = await keySet();
    const token = await new SignJWT({
      linked_accounts: JSON.stringify([
        { type: "wallet", address: "0xabc" },
        { type: "email", address: "owner@example.com" },
      ]),
    })
      .setProtectedHeader({ alg: "ES256", kid: "test-key" })
      .setIssuer("privy.io")
      .setAudience("test-app-id")
      .setSubject("did:privy:abc123")
      .setIssuedAt()
      .setExpirationTime("1h")
      .sign(privateKey);
    const identity = await verifyPrivyIdentityToken(token, "test-app-id", jwks);
    expect(identity?.did).toBe("did:privy:abc123");
    expect(identity?.email).toBe("owner@example.com");
  });
});
