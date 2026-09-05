import { z } from "zod";

/**
 * Server configuration. Every secret lives here and only here — the mobile app
 * ships none of them (design doc §10.2). Parsed once at boot so a missing
 * variable fails loudly at startup rather than at 3 a.m. in a request.
 */
const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(8080),

  /** Public base URL of this server, used in OAuth metadata. Must be https in production. */
  PUBLIC_BASE_URL: z.string().url(),

  SUPABASE_URL: z.string().url(),
  SUPABASE_ANON_KEY: z.string().min(1),
  /** Service role: bypasses RLS. Never sent to a client, never used to serve a user request. */
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),

  ANTHROPIC_API_KEY: z.string().min(1),
  /**
   * Vision model. Must be a model eligible for zero data retention —
   * design doc §10.3: the Fable tier requires 30-day retention.
   */
  VISION_MODEL: z.string().default("claude-opus-5"),

  /** Signing key for MCP access tokens (JWK or raw secret, min 32 chars). */
  MCP_TOKEN_SECRET: z.string().min(32),

  /** Contact string sent to Open Food Facts, which asks for identifiable traffic. */
  OFF_USER_AGENT: z.string().default("awe/0.1 (support@atewhatexactly.app)"),

  /**
   * Photo estimates are the only thing here that costs money — barcode,
   * recipe and manual logging never reach the API. Two ceilings, because they
   * catch different failures:
   *
   *  - per hour guards a burst: a retry loop, a stuck screen.
   *  - per day is what actually bounds the bill. A person eats a handful of
   *    meals a day, so 30 is generous; 30/hour alone would permit 720 a day,
   *    which is no limit at all in cost terms.
   */
  RATE_LIMIT_VISION_PER_HOUR: z.coerce.number().int().min(1).default(12),
  RATE_LIMIT_VISION_PER_DAY: z.coerce.number().int().min(1).default(30),
  RATE_LIMIT_API_PER_MINUTE: z.coerce.number().int().min(1).default(120),
});

export type Config = z.infer<typeof EnvSchema> & { isProduction: boolean };

let cached: Config | undefined;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = EnvSchema.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Invalid server configuration:\n${issues}`);
  }
  const isProduction = parsed.data.NODE_ENV === "production";
  if (isProduction && !parsed.data.PUBLIC_BASE_URL.startsWith("https://")) {
    throw new Error("PUBLIC_BASE_URL must be https in production");
  }
  return { ...parsed.data, isProduction };
}

export function getConfig(): Config {
  cached ??= loadConfig();
  return cached;
}
