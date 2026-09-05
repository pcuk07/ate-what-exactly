import { Router, type Request, type Response } from "express";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { Config } from "../config.js";
import { createMcpServer } from "../mcp/server.js";
import { requireMcpAuth } from "./context.js";
import { RateLimiter } from "../middleware/rate-limit.js";

/**
 * Remote MCP over Streamable HTTP (design doc §4). Stateless mode: each request
 * builds a server bound to the caller's identity, so one person's connector can
 * never observe another's session.
 */
export function createMcpRouter(config: Config): Router {
  const router = Router();
  const limiter = new RateLimiter(config.RATE_LIMIT_API_PER_MINUTE, 60 * 1000);

  router.post("/mcp", requireMcpAuth(config, "diary:read"), async (req: Request, res: Response) => {
    if (!limiter.check(req.userId!).allowed) {
      res.status(429).json({
        jsonrpc: "2.0",
        error: { code: -32000, message: "Too many requests. Try again shortly." },
        id: null,
      });
      return;
    }

    const server = createMcpServer(req.service!);
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined, // stateless: no cross-request session state
      enableJsonResponse: true,
    });

    res.on("close", () => {
      void transport.close();
      void server.close();
    });

    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  });

  // Stateless servers have nothing to resume or terminate.
  const methodNotAllowed = (_req: Request, res: Response) => {
    res.status(405).json({
      jsonrpc: "2.0",
      error: { code: -32000, message: "Method not allowed." },
      id: null,
    });
  };
  router.get("/mcp", methodNotAllowed);
  router.delete("/mcp", methodNotAllowed);

  return router;
}
