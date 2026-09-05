import { describe, expect, it } from "vitest";
import { createApp } from "../app.js";
import { loadConfig } from "../config.js";

/**
 * Boot the real app and exercise the endpoints that must work before anyone
 * can connect: health, and the two OAuth discovery documents an MCP client
 * reads to find out where to authenticate.
 */
const env = {
  NODE_ENV: "test",
  PUBLIC_BASE_URL: "https://api.example.com",
  SUPABASE_URL: "https://project.supabase.co",
  SUPABASE_ANON_KEY: "anon",
  SUPABASE_SERVICE_ROLE_KEY: "service",
  ANTHROPIC_API_KEY: "sk-ant-test",
  MCP_TOKEN_SECRET: "x".repeat(48),
} as NodeJS.ProcessEnv;

const config = loadConfig(env);

/** Start the app on an ephemeral port and return its base URL. */
async function withServer<T>(fn: (base: string) => Promise<T>): Promise<T> {
  const app = createApp(config);
  const server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  try {
    return await fn(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

describe("configuration", () => {
  it("rejects a missing secret rather than starting half-configured", () => {
    const { MCP_TOKEN_SECRET: _omitted, ...rest } = env;
    expect(() => loadConfig(rest as NodeJS.ProcessEnv)).toThrow(/MCP_TOKEN_SECRET/);
  });

  it("refuses a plaintext base URL in production", () => {
    expect(() => loadConfig({ ...env, NODE_ENV: "production", PUBLIC_BASE_URL: "http://api.example.com" })).toThrow(
      /https/,
    );
  });

  it("rejects a token secret short enough to brute-force", () => {
    expect(() => loadConfig({ ...env, MCP_TOKEN_SECRET: "short" })).toThrow(/MCP_TOKEN_SECRET/);
  });

  it("bounds photo spend by the day, not only by the hour", () => {
    // An hourly cap alone permits 24× its value per day, which is no ceiling
    // at all when every call costs money.
    const c = loadConfig(env);
    expect(c.RATE_LIMIT_VISION_PER_DAY).toBeLessThan(c.RATE_LIMIT_VISION_PER_HOUR * 24);
  });

  it("lets the caps be tightened from the environment", () => {
    const c = loadConfig({ ...env, RATE_LIMIT_VISION_PER_DAY: "5", RATE_LIMIT_VISION_PER_HOUR: "2" });
    expect(c.RATE_LIMIT_VISION_PER_DAY).toBe(5);
    expect(c.RATE_LIMIT_VISION_PER_HOUR).toBe(2);
  });

  it("refuses a zero cap, which would silently disable photo logging", () => {
    expect(() => loadConfig({ ...env, RATE_LIMIT_VISION_PER_DAY: "0" })).toThrow();
  });
});

describe("the running server", () => {
  it("reports health", async () => {
    await withServer(async (base) => {
      const res = await fetch(`${base}/health`);
      expect(res.status).toBe(200);
      expect(await res.json()).toMatchObject({ status: "ok" });
    });
  });

  it("publishes protected-resource metadata pointing at the MCP endpoint", async () => {
    await withServer(async (base) => {
      const res = await fetch(`${base}/.well-known/oauth-protected-resource`);
      expect(res.status).toBe(200);
      expect(await res.json()).toMatchObject({
        resource: "https://api.example.com/mcp",
        authorization_servers: ["https://api.example.com"],
      });
    });
  });

  it("publishes authorization-server metadata that requires PKCE", async () => {
    await withServer(async (base) => {
      const body = (await (await fetch(`${base}/.well-known/oauth-authorization-server`)).json()) as {
        code_challenge_methods_supported: string[];
        token_endpoint: string;
      };
      expect(body.code_challenge_methods_supported).toEqual(["S256"]);
      expect(body.token_endpoint).toBe("https://api.example.com/oauth/token");
    });
  });

  it("refuses an unauthenticated MCP call and says where to authenticate", async () => {
    await withServer(async (base) => {
      const res = await fetch(`${base}/mcp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", method: "tools/list", id: 1 }),
      });
      expect(res.status).toBe(401);
      expect(res.headers.get("www-authenticate")).toContain("oauth-protected-resource");
    });
  });

  it("rejects a forged MCP token", async () => {
    await withServer(async (base) => {
      const res = await fetch(`${base}/mcp`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer not-a-real-token" },
        body: JSON.stringify({ jsonrpc: "2.0", method: "tools/list", id: 1 }),
      });
      expect(res.status).toBe(401);
    });
  });

  it("refuses an unauthenticated call to the app API", async () => {
    await withServer(async (base) => {
      const res = await fetch(`${base}/api/day`);
      expect(res.status).toBe(401);
    });
  });

  it("sets the baseline security headers", async () => {
    await withServer(async (base) => {
      const res = await fetch(`${base}/health`);
      expect(res.headers.get("x-content-type-options")).toBe("nosniff");
      expect(res.headers.get("cache-control")).toBe("no-store");
      expect(res.headers.get("x-powered-by")).toBeNull();
    });
  });

  it("does not answer GET on the stateless MCP endpoint", async () => {
    await withServer(async (base) => {
      const res = await fetch(`${base}/mcp`);
      expect(res.status).toBe(405);
    });
  });
});
