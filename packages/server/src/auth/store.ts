import type { SupabaseClient } from "@supabase/supabase-js";
import { randomToken } from "./pkce.js";
import type { McpScope } from "./tokens.js";

/**
 * OAuth client registrations, authorization codes and refresh tokens.
 * Backed by Postgres so they survive a restart and can be revoked.
 */

export interface OAuthClient {
  clientId: string;
  clientName: string;
  redirectUris: string[];
  createdAt: string;
}

export interface AuthorizationCode {
  code: string;
  clientId: string;
  userId: string;
  redirectUri: string;
  codeChallenge: string;
  codeChallengeMethod: string;
  scopes: McpScope[];
  expiresAt: string;
}

export const AUTH_CODE_TTL_MS = 60_000; // one minute is plenty for a redirect

export class OAuthStore {
  constructor(private readonly db: SupabaseClient) {}

  async registerClient(clientName: string, redirectUris: string[]): Promise<OAuthClient> {
    const clientId = randomToken(16);
    const { error } = await this.db.from("oauth_clients").insert({
      client_id: clientId,
      client_name: clientName.slice(0, 120),
      redirect_uris: redirectUris,
    });
    if (error) throw new Error(`Could not register the client: ${error.message}`);
    return { clientId, clientName, redirectUris, createdAt: new Date().toISOString() };
  }

  async getClient(clientId: string): Promise<OAuthClient | null> {
    const { data, error } = await this.db
      .from("oauth_clients")
      .select()
      .eq("client_id", clientId)
      .maybeSingle();
    if (error) throw new Error(`Could not read the client: ${error.message}`);
    if (!data) return null;
    const row = data as {
      client_id: string;
      client_name: string;
      redirect_uris: string[];
      created_at: string;
    };
    return {
      clientId: row.client_id,
      clientName: row.client_name,
      redirectUris: row.redirect_uris,
      createdAt: row.created_at,
    };
  }

  async saveCode(code: AuthorizationCode): Promise<void> {
    const { error } = await this.db.from("oauth_codes").insert({
      code: code.code,
      client_id: code.clientId,
      user_id: code.userId,
      redirect_uri: code.redirectUri,
      code_challenge: code.codeChallenge,
      code_challenge_method: code.codeChallengeMethod,
      scopes: code.scopes,
      expires_at: code.expiresAt,
    });
    if (error) throw new Error(`Could not save the authorization code: ${error.message}`);
  }

  /** Codes are single-use: consuming one deletes it, so a replay finds nothing. */
  async consumeCode(code: string): Promise<AuthorizationCode | null> {
    const { data, error } = await this.db
      .from("oauth_codes")
      .delete()
      .eq("code", code)
      .select()
      .maybeSingle();
    if (error) throw new Error(`Could not read the authorization code: ${error.message}`);
    if (!data) return null;
    const row = data as {
      code: string;
      client_id: string;
      user_id: string;
      redirect_uri: string;
      code_challenge: string;
      code_challenge_method: string;
      scopes: string[];
      expires_at: string;
    };
    if (Date.parse(row.expires_at) < Date.now()) return null;
    return {
      code: row.code,
      clientId: row.client_id,
      userId: row.user_id,
      redirectUri: row.redirect_uri,
      codeChallenge: row.code_challenge,
      codeChallengeMethod: row.code_challenge_method,
      scopes: row.scopes as McpScope[],
      expiresAt: row.expires_at,
    };
  }

  /**
   * Refresh tokens rotate on every use, and a reused token revokes the whole
   * family — the standard detection for a stolen token (design doc §10.5).
   */
  async issueRefreshToken(
    userId: string,
    clientId: string,
    scopes: McpScope[],
    familyId = randomToken(16),
  ): Promise<string> {
    const token = randomToken(32);
    const { error } = await this.db.from("oauth_refresh_tokens").insert({
      token,
      family_id: familyId,
      user_id: userId,
      client_id: clientId,
      scopes,
      expires_at: new Date(Date.now() + 30 * 86_400_000).toISOString(),
    });
    if (error) throw new Error(`Could not issue a refresh token: ${error.message}`);
    return token;
  }

  async rotateRefreshToken(token: string): Promise<
    { userId: string; clientId: string; scopes: McpScope[]; next: string } | null
  > {
    const { data, error } = await this.db
      .from("oauth_refresh_tokens")
      .select()
      .eq("token", token)
      .maybeSingle();
    if (error) throw new Error(`Could not read the refresh token: ${error.message}`);
    if (!data) return null;
    const row = data as {
      token: string;
      family_id: string;
      user_id: string;
      client_id: string;
      scopes: string[];
      used_at: string | null;
      expires_at: string;
    };

    if (row.used_at) {
      // Reuse: assume the token was stolen and revoke every sibling.
      await this.db.from("oauth_refresh_tokens").delete().eq("family_id", row.family_id);
      return null;
    }
    if (Date.parse(row.expires_at) < Date.now()) return null;

    await this.db
      .from("oauth_refresh_tokens")
      .update({ used_at: new Date().toISOString() })
      .eq("token", token);

    const scopes = row.scopes as McpScope[];
    const next = await this.issueRefreshToken(row.user_id, row.client_id, scopes, row.family_id);
    return { userId: row.user_id, clientId: row.client_id, scopes, next };
  }

  async revokeRefreshToken(token: string): Promise<void> {
    const { data } = await this.db
      .from("oauth_refresh_tokens")
      .select("family_id")
      .eq("token", token)
      .maybeSingle();
    if (data) {
      await this.db
        .from("oauth_refresh_tokens")
        .delete()
        .eq("family_id", (data as { family_id: string }).family_id);
    }
  }

  /** Account deletion cascades here (design doc §10.4). */
  async revokeAllForUser(userId: string): Promise<void> {
    await this.db.from("oauth_refresh_tokens").delete().eq("user_id", userId);
    await this.db.from("oauth_codes").delete().eq("user_id", userId);
  }
}
