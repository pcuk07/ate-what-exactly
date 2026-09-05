import express, { type Express } from "express";
import type { Config } from "./config.js";
import { createApiRouter, errorHandler } from "./http/api-routes.js";
import { createMcpRouter } from "./http/mcp-routes.js";
import { createOAuthRouter } from "./http/oauth-routes.js";

export function createApp(config: Config): Express {
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", 1);

  // Photos arrive base64-encoded inside JSON; 8 MB covers a 5 MB image.
  app.use(express.json({ limit: "9mb" }));
  app.use(express.urlencoded({ extended: false }));

  app.use((_req, res, next) => {
    res.set("X-Content-Type-Options", "nosniff");
    res.set("Referrer-Policy", "no-referrer");
    res.set("Cache-Control", "no-store");
    if (config.isProduction) {
      res.set("Strict-Transport-Security", "max-age=63072000; includeSubDomains");
    }
    next();
  });

  app.get("/health", (_req, res) => {
    res.json({ status: "ok", version: "0.1.0" });
  });

  app.use(createOAuthRouter(config));
  app.use(createMcpRouter(config));
  app.use("/api", createApiRouter(config));

  app.use((_req, res) => {
    res.status(404).json({ error: "not_found" });
  });
  app.use(errorHandler(config.isProduction));

  return app;
}
