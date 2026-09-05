import { describe, expect, it } from "vitest";
import { randomToken, redirectUriAllowed, s256, verifyPkce } from "../auth/pkce.js";
import {
  authorizationServerMetadata,
  hasScope,
  protectedResourceMetadata,
  signAccessToken,
  verifyAccessToken,
} from "../auth/tokens.js";

const secret = "a".repeat(48);
const issuer = "https://api.example.com";

describe("PKCE", () => {
  it("accepts a verifier that matches its challenge", () => {
    const verifier = randomToken(32);
    expect(verifyPkce(verifier, s256(verifier), "S256")).toBe(true);
  });

  it("rejects a mismatched verifier", () => {
    expect(verifyPkce(randomToken(32), s256(randomToken(32)), "S256")).toBe(false);
  });

  it("refuses the plain method outright", () => {
    const verifier = randomToken(32);
    expect(verifyPkce(verifier, verifier, "plain")).toBe(false);
  });
});

describe("redirect URIs", () => {
  const registered = ["https://claude.ai/api/mcp/auth_callback", "http://127.0.0.1:5173/callback"];

  it("accepts an exactly registered URI", () => {
    expect(redirectUriAllowed(registered, "https://claude.ai/api/mcp/auth_callback")).toBe(true);
  });

  it("rejects a different path on a registered host", () => {
    expect(redirectUriAllowed(registered, "https://claude.ai/evil")).toBe(false);
  });

  it("rejects a lookalike host", () => {
    expect(redirectUriAllowed(registered, "https://claude.ai.evil.com/api/mcp/auth_callback")).toBe(false);
  });

  it("allows a loopback client to use any port, as native clients must", () => {
    expect(redirectUriAllowed(registered, "http://127.0.0.1:61234/callback")).toBe(true);
  });

  it("does not extend the loopback exemption to other paths", () => {
    expect(redirectUriAllowed(registered, "http://127.0.0.1:61234/other")).toBe(false);
  });

  it("rejects nonsense", () => {
    expect(redirectUriAllowed(registered, "not a url")).toBe(false);
  });
});

describe("access tokens", () => {
  it("round-trips a token and its scopes", async () => {
    const token = await signAccessToken(
      secret,
      { userId: "user-1", clientId: "c1", scopes: ["diary:read", "diary:write"] },
      issuer,
    );
    const claims = await verifyAccessToken(secret, token, issuer);
    expect(claims.sub).toBe("user-1");
    expect(hasScope(claims, "diary:write")).toBe(true);
  });

  it("reports a scope the token does not carry", async () => {
    const token = await signAccessToken(secret, { userId: "u", clientId: "c", scopes: ["diary:read"] }, issuer);
    expect(hasScope(await verifyAccessToken(secret, token, issuer), "diary:write")).toBe(false);
  });

  it("rejects a token signed with another key", async () => {
    const token = await signAccessToken(secret, { userId: "u", clientId: "c", scopes: ["diary:read"] }, issuer);
    await expect(verifyAccessToken("b".repeat(48), token, issuer)).rejects.toThrow();
  });

  it("rejects a token issued for another server", async () => {
    const token = await signAccessToken(secret, { userId: "u", clientId: "c", scopes: ["diary:read"] }, issuer);
    await expect(verifyAccessToken(secret, token, "https://other.example.com")).rejects.toThrow();
  });

  it("rejects an expired token", async () => {
    const token = await signAccessToken(
      secret,
      { userId: "u", clientId: "c", scopes: ["diary:read"] },
      issuer,
      -10,
    );
    await expect(verifyAccessToken(secret, token, issuer)).rejects.toThrow();
  });
});

describe("discovery metadata", () => {
  it("points clients at the token endpoint and requires PKCE", () => {
    const meta = authorizationServerMetadata(issuer);
    expect(meta.token_endpoint).toBe(`${issuer}/oauth/token`);
    expect(meta.code_challenge_methods_supported).toEqual(["S256"]);
  });

  it("advertises the protected resource and its scopes", () => {
    const meta = protectedResourceMetadata(issuer);
    expect(meta.resource).toBe(`${issuer}/mcp`);
    expect(meta.scopes_supported).toContain("diary:write");
  });
});
