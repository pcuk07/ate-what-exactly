import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/** PKCE (RFC 7636). Required on every authorization — design doc §10.5. */

export function base64url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function randomToken(bytes = 32): string {
  return base64url(randomBytes(bytes));
}

export function s256(verifier: string): string {
  return base64url(createHash("sha256").update(verifier).digest());
}

/** Constant-time comparison, so a challenge check can't be timed. */
export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

export function verifyPkce(verifier: string, challenge: string, method: string): boolean {
  if (method !== "S256") return false; // plain is not accepted
  return safeEqual(s256(verifier), challenge);
}

/**
 * Redirect URIs must match exactly — no prefix matching, no wildcards
 * (design doc §10.5). Loopback ports are the one allowed variation, since
 * native clients pick a random port.
 */
export function redirectUriAllowed(registered: readonly string[], candidate: string): boolean {
  if (registered.includes(candidate)) return true;
  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return false;
  }
  const isLoopback = url.hostname === "127.0.0.1" || url.hostname === "[::1]";
  if (!isLoopback) return false;
  return registered.some((r) => {
    try {
      const reg = new URL(r);
      return (
        reg.hostname === url.hostname &&
        reg.protocol === url.protocol &&
        reg.pathname === url.pathname
      );
    } catch {
      return false;
    }
  });
}
