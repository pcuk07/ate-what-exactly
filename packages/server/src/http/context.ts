import type { Request, Response, NextFunction } from "express";
import { createUserClient, getAdminClient } from "../supabase.js";
import type { Config } from "../config.js";
import { CalibrationRepository, MealsRepository } from "../repositories/meals.js";
import { FoodsRepository, GoalsRepository, RecipesRepository } from "../repositories/foods.js";
import { MealService } from "../services/meal-service.js";
import { verifyAccessToken, hasScope, type McpScope } from "../auth/tokens.js";

declare module "express-serve-static-core" {
  interface Request {
    userId?: string;
    service?: MealService;
    scopes?: string[];
  }
}

/**
 * Builds the per-request service. The user client carries the caller's token so
 * RLS applies to their own rows; the admin client is used only for the shared
 * food tables, which have no per-user scope (design doc §10.5).
 */
export function buildService(config: Config, userId: string, accessToken: string): MealService {
  const userDb = createUserClient(config, accessToken);
  const adminDb = getAdminClient(config);
  return new MealService(userId, {
    meals: new MealsRepository(userDb),
    calibrations: new CalibrationRepository(userDb),
    recipes: new RecipesRepository(userDb),
    goals: new GoalsRepository(userDb),
    foods: new FoodsRepository(adminDb),
    config,
  });
}

/** Bearer auth for the app's own API: a Supabase access token. */
export function requireAppAuth(config: Config) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const token = bearer(req);
    if (!token) {
      res.status(401).json({ error: "unauthorized", message: "Sign in to continue." });
      return;
    }
    try {
      const { data, error } = await getAdminClient(config).auth.getUser(token);
      if (error || !data.user) {
        res.status(401).json({ error: "unauthorized", message: "That session has expired." });
        return;
      }
      req.userId = data.user.id;
      req.service = buildService(config, data.user.id, token);
      next();
    } catch {
      res.status(401).json({ error: "unauthorized", message: "That session could not be verified." });
    }
  };
}

/**
 * Bearer auth for the MCP connector: one of our own access tokens.
 * On failure we return the WWW-Authenticate header pointing at the resource
 * metadata, which is how an MCP client discovers where to authenticate.
 */
export function requireMcpAuth(config: Config, scope: McpScope) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const token = bearer(req);
    const challenge = `Bearer resource_metadata="${config.PUBLIC_BASE_URL}/.well-known/oauth-protected-resource"`;
    if (!token) {
      res.set("WWW-Authenticate", challenge).status(401).json({ error: "unauthorized" });
      return;
    }
    try {
      const claims = await verifyAccessToken(config.MCP_TOKEN_SECRET, token, config.PUBLIC_BASE_URL);
      if (!hasScope(claims, scope)) {
        res.status(403).json({ error: "insufficient_scope", scope });
        return;
      }
      req.userId = claims.sub;
      req.scopes = claims.scope.split(" ");
      // MCP tokens are ours, not Supabase's, so the service layer runs with the
      // admin client scoped explicitly to this user id.
      req.service = buildMcpService(config, claims.sub);
      next();
    } catch {
      res.set("WWW-Authenticate", challenge).status(401).json({ error: "invalid_token" });
    }
  };
}

/**
 * For MCP callers we hold no Supabase session, so RLS can't scope the query for
 * us. Every repository call is therefore explicitly filtered by user id, and the
 * filter is applied here rather than trusted from the caller.
 */
function buildMcpService(config: Config, userId: string): MealService {
  const adminDb = getAdminClient(config);
  const scoped = scopedClient(adminDb, userId);
  return new MealService(userId, {
    meals: new MealsRepository(scoped),
    calibrations: new CalibrationRepository(scoped),
    recipes: new RecipesRepository(scoped),
    goals: new GoalsRepository(scoped),
    foods: new FoodsRepository(adminDb),
    config,
  });
}

/**
 * Wraps the admin client so every query against a user-owned table is filtered
 * by user_id, and every insert carries it. This is the belt to RLS's braces:
 * a missing filter becomes impossible rather than merely unlikely.
 */
function scopedClient(db: ReturnType<typeof getAdminClient>, userId: string) {
  const USER_TABLES = new Set(["meals", "recipes", "goals", "calibrations", "corrections"]);
  return new Proxy(db, {
    get(target, prop, receiver) {
      if (prop !== "from") return Reflect.get(target, prop, receiver);
      return (table: string) => {
        const builder = target.from(table);
        if (!USER_TABLES.has(table)) return builder;
        return new Proxy(builder, {
          get(b, method, r) {
            const value = Reflect.get(b, method, r);
            if (typeof value !== "function") return value;
            return (...args: unknown[]) => {
              const result = (value as (...a: unknown[]) => unknown).apply(b, args);
              if (method === "select" || method === "update" || method === "delete") {
                return (result as { eq: (c: string, v: string) => unknown }).eq("user_id", userId);
              }
              return result;
            };
          },
        });
      };
    },
  });
}

function bearer(req: Request): string | null {
  const header = req.get("authorization");
  if (!header?.toLowerCase().startsWith("bearer ")) return null;
  const token = header.slice(7).trim();
  return token.length > 0 ? token : null;
}
