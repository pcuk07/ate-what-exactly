import { SignJWT, jwtVerify, type JWTPayload } from "jose";

/**
 * Access tokens for the MCP connector (design doc §4, §10.5).
 *
 * Supabase Auth identifies people inside our own app; it is not an OAuth
 * authorization server a third party like Claude can register against. This
 * module issues our own short-lived tokens, bound to a Supabase user id, after
 * that person has authenticated through Supabase in the browser.
 */

export const ACCESS_TOKEN_TTL_SECONDS = 3600; // §10.5: ≤ 1 hour
export const REFRESH_TOKEN_TTL_SECONDS = 60 * 60 * 24 * 30;

export const MCP_SCOPES = ["diary:read", "diary:write"] as const;
export type McpScope = (typeof MCP_SCOPES)[number];

export interface AccessTokenClaims extends JWTPayload {
  sub: string;
  scope: string;
  client_id: string;
}

const enc = new TextEncoder();

export async function signAccessToken(
  secret: string,
  claims: { userId: string; clientId: string; scopes: readonly McpScope[] },
  issuer: string,
  ttlSeconds = ACCESS_TOKEN_TTL_SECONDS,
): Promise<string> {
  return new SignJWT({ scope: claims.scopes.join(" "), client_id: claims.clientId })
    .setProtectedHeader({ alg: "HS256", typ: "at+jwt" })
    .setSubject(claims.userId)
    .setIssuer(issuer)
    .setAudience(issuer)
    .setIssuedAt()
    .setExpirationTime(`${ttlSeconds}s`)
    .sign(enc.encode(secret));
}

export async function verifyAccessToken(
  secret: string,
  token: string,
  issuer: string,
): Promise<AccessTokenClaims> {
  const { payload } = await jwtVerify(token, enc.encode(secret), {
    issuer,
    audience: issuer,
  });
  if (typeof payload.sub !== "string" || !payload.sub) {
    throw new Error("Token has no subject");
  }
  return payload as AccessTokenClaims;
}

export function hasScope(claims: AccessTokenClaims, scope: McpScope): boolean {
  return claims.scope.split(" ").includes(scope);
}

/**
 * OAuth 2.0 Protected Resource Metadata (RFC 9728) — what an MCP client reads
 * to discover where to authenticate.
 */
export function protectedResourceMetadata(baseUrl: string) {
  return {
    resource: `${baseUrl}/mcp`,
    authorization_servers: [baseUrl],
    scopes_supported: [...MCP_SCOPES],
    bearer_methods_supported: ["header"],
  };
}

/** OAuth 2.0 Authorization Server Metadata (RFC 8414). */
export function authorizationServerMetadata(baseUrl: string) {
  return {
    issuer: baseUrl,
    authorization_endpoint: `${baseUrl}/oauth/authorize`,
    token_endpoint: `${baseUrl}/oauth/token`,
    registration_endpoint: `${baseUrl}/oauth/register`,
    revocation_endpoint: `${baseUrl}/oauth/revoke`,
    scopes_supported: [...MCP_SCOPES],
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"], // §10.5: PKCE required
    token_endpoint_auth_methods_supported: ["none", "client_secret_post"],
  };
}
