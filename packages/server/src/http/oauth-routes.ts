import { Router, type Request, type Response } from "express";
import { z } from "zod";
import type { Config } from "../config.js";
import { getAdminClient } from "../supabase.js";
import { OAuthStore, AUTH_CODE_TTL_MS } from "../auth/store.js";
import { randomToken, redirectUriAllowed, verifyPkce } from "../auth/pkce.js";
import {
  ACCESS_TOKEN_TTL_SECONDS,
  authorizationServerMetadata,
  MCP_SCOPES,
  protectedResourceMetadata,
  signAccessToken,
  type McpScope,
} from "../auth/tokens.js";
import { RateLimiter } from "../middleware/rate-limit.js";

/**
 * The OAuth layer that lets someone connect this app to their own Claude
 * (design doc §4). Supabase Auth proves who they are; we mint the tokens the
 * MCP connector accepts.
 */

const RegisterSchema = z.object({
  client_name: z.string().min(1).max(120).default("MCP client"),
  redirect_uris: z.array(z.string().url()).min(1).max(10),
});

const AuthorizeSchema = z.object({
  client_id: z.string().min(1),
  redirect_uri: z.string().url(),
  response_type: z.literal("code"),
  code_challenge: z.string().min(43).max(128),
  code_challenge_method: z.literal("S256"),
  state: z.string().max(512).optional(),
  scope: z.string().max(200).optional(),
});

export function createOAuthRouter(config: Config): Router {
  const router = Router();
  const store = new OAuthStore(getAdminClient(config));
  // Registration is open by spec but rate-limited, so it can't be used to
  // fill the table (design doc §12).
  const registerLimiter = new RateLimiter(10, 60 * 60 * 1000);

  router.get("/.well-known/oauth-protected-resource", (_req, res) => {
    res.json(protectedResourceMetadata(config.PUBLIC_BASE_URL));
  });
  router.get("/.well-known/oauth-authorization-server", (_req, res) => {
    res.json(authorizationServerMetadata(config.PUBLIC_BASE_URL));
  });

  router.post("/oauth/register", async (req: Request, res: Response) => {
    const ip = req.ip ?? "unknown";
    if (!registerLimiter.check(ip).allowed) {
      res.status(429).json({ error: "too_many_requests" });
      return;
    }
    const parsed = RegisterSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_client_metadata" });
      return;
    }
    const client = await store.registerClient(parsed.data.client_name, parsed.data.redirect_uris);
    res.status(201).json({
      client_id: client.clientId,
      client_name: client.clientName,
      redirect_uris: client.redirectUris,
      token_endpoint_auth_method: "none",
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
    });
  });

  /**
   * The consent screen. Rendered server-side and deliberately plain: it names
   * what the connector will be able to read and change, because the person
   * granting it is about to hand Claude their food diary.
   */
  router.get("/oauth/authorize", async (req: Request, res: Response) => {
    const parsed = AuthorizeSchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).send(errorPage("That authorization request is missing something."));
      return;
    }
    const client = await store.getClient(parsed.data.client_id);
    if (!client || !redirectUriAllowed(client.redirectUris, parsed.data.redirect_uri)) {
      // Never redirect to an unverified URI — report in place instead.
      res.status(400).send(errorPage("That app isn't registered for this redirect address."));
      return;
    }
    res.type("html").send(consentPage(client.clientName, req.originalUrl));
  });

  /** Consent form post: authenticate with Supabase, then issue the code. */
  router.post("/oauth/authorize", async (req: Request, res: Response) => {
    const parsed = AuthorizeSchema.safeParse(req.body);
    const credentials = z
      .object({ email: z.string().email(), password: z.string().min(1) })
      .safeParse(req.body);
    if (!parsed.success || !credentials.success) {
      res.status(400).send(errorPage("Check the email address and password and try again."));
      return;
    }
    const client = await store.getClient(parsed.data.client_id);
    if (!client || !redirectUriAllowed(client.redirectUris, parsed.data.redirect_uri)) {
      res.status(400).send(errorPage("That app isn't registered for this redirect address."));
      return;
    }

    const { data, error } = await getAdminClient(config).auth.signInWithPassword({
      email: credentials.data.email,
      password: credentials.data.password,
    });
    if (error || !data.user) {
      res.status(401).send(consentPage(client.clientName, req.originalUrl, "That didn't match an account."));
      return;
    }

    const requested = (parsed.data.scope ?? MCP_SCOPES.join(" ")).split(" ");
    const scopes = MCP_SCOPES.filter((s) => requested.includes(s));
    const code = randomToken(32);
    await store.saveCode({
      code,
      clientId: client.clientId,
      userId: data.user.id,
      redirectUri: parsed.data.redirect_uri,
      codeChallenge: parsed.data.code_challenge,
      codeChallengeMethod: parsed.data.code_challenge_method,
      scopes: scopes.length ? scopes : [...MCP_SCOPES],
      expiresAt: new Date(Date.now() + AUTH_CODE_TTL_MS).toISOString(),
    });

    const location = new URL(parsed.data.redirect_uri);
    location.searchParams.set("code", code);
    if (parsed.data.state) location.searchParams.set("state", parsed.data.state);
    res.redirect(location.toString());
  });

  router.post("/oauth/token", async (req: Request, res: Response) => {
    const grant = String(req.body?.grant_type ?? "");
    try {
      if (grant === "authorization_code") {
        const body = z
          .object({
            code: z.string().min(1),
            redirect_uri: z.string().url(),
            code_verifier: z.string().min(43).max(128),
            client_id: z.string().min(1),
          })
          .parse(req.body);

        const saved = await store.consumeCode(body.code);
        if (
          !saved ||
          saved.clientId !== body.client_id ||
          saved.redirectUri !== body.redirect_uri ||
          !verifyPkce(body.code_verifier, saved.codeChallenge, saved.codeChallengeMethod)
        ) {
          res.status(400).json({ error: "invalid_grant" });
          return;
        }
        res.json(
          await issueTokens(config, store, saved.userId, saved.clientId, saved.scopes),
        );
        return;
      }

      if (grant === "refresh_token") {
        const body = z.object({ refresh_token: z.string().min(1) }).parse(req.body);
        const rotated = await store.rotateRefreshToken(body.refresh_token);
        if (!rotated) {
          res.status(400).json({ error: "invalid_grant" });
          return;
        }
        const access = await signAccessToken(
          config.MCP_TOKEN_SECRET,
          { userId: rotated.userId, clientId: rotated.clientId, scopes: rotated.scopes },
          config.PUBLIC_BASE_URL,
        );
        res.json({
          access_token: access,
          token_type: "Bearer",
          expires_in: ACCESS_TOKEN_TTL_SECONDS,
          refresh_token: rotated.next,
          scope: rotated.scopes.join(" "),
        });
        return;
      }

      res.status(400).json({ error: "unsupported_grant_type" });
    } catch {
      res.status(400).json({ error: "invalid_request" });
    }
  });

  router.post("/oauth/revoke", async (req: Request, res: Response) => {
    const token = String(req.body?.token ?? "");
    if (token) await store.revokeRefreshToken(token);
    res.status(200).json({});
  });

  return router;
}

async function issueTokens(
  config: Config,
  store: OAuthStore,
  userId: string,
  clientId: string,
  scopes: McpScope[],
) {
  const access = await signAccessToken(
    config.MCP_TOKEN_SECRET,
    { userId, clientId, scopes },
    config.PUBLIC_BASE_URL,
  );
  const refresh = await store.issueRefreshToken(userId, clientId, scopes);
  return {
    access_token: access,
    token_type: "Bearer",
    expires_in: ACCESS_TOKEN_TTL_SECONDS,
    refresh_token: refresh,
    scope: scopes.join(" "),
  };
}

const escape = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

function page(body: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>awe</title>
<style>
:root{color-scheme:light dark}
body{font:16px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;max-width:26rem;margin:3rem auto;padding:0 1.25rem}
h1{font-size:1.35rem;margin:0 0 .5rem}
ul{padding-left:1.1rem}label{display:block;margin:.85rem 0 .25rem;font-weight:600}
input{width:100%;padding:.6rem;font-size:1rem;border:1px solid #8884;border-radius:.5rem;background:transparent;color:inherit}
button{margin-top:1.25rem;width:100%;padding:.7rem;font-size:1rem;font-weight:600;border:0;border-radius:.5rem;background:#0E7C72;color:#fff}
.err{color:#B45309;font-weight:600}.muted{color:#6b7280;font-size:.9rem}
</style></head><body>${body}</body></html>`;
}

function consentPage(clientName: string, actionUrl: string, error?: string): string {
  const hidden = new URL(actionUrl, "http://placeholder").searchParams;
  const fields = [...hidden.entries()]
    .map(([k, v]) => `<input type="hidden" name="${escape(k)}" value="${escape(v)}">`)
    .join("");
  return page(`
<h1>Connect ${escape(clientName)}</h1>
<p>Signing in lets ${escape(clientName)} act on your food diary:</p>
<ul>
  <li>Read your entries, totals and goals</li>
  <li>Log new meals and correct existing ones</li>
</ul>
<p class="muted">It cannot see your password, and you can disconnect it at any time in the app.</p>
${error ? `<p class="err">${escape(error)}</p>` : ""}
<form method="post">
  ${fields}
  <label for="email">Email</label>
  <input id="email" name="email" type="email" autocomplete="username" required>
  <label for="password">Password</label>
  <input id="password" name="password" type="password" autocomplete="current-password" required>
  <button type="submit">Sign in and connect</button>
</form>`);
}

function errorPage(message: string): string {
  return page(`<h1>Something's not right</h1><p class="err">${escape(message)}</p>
<p class="muted">Close this window and try connecting again from the app that sent you here.</p>`);
}
