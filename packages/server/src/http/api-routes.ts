import { Router, type Request, type Response } from "express";
import { z } from "zod";
import {
  GoalsSchema,
  AnswersSchema,
  VisionResultSchema,
  MealTypeSchema,
  BarcodeSchema,
  CorrectionInputSchema,
  isOwnedPhotoPath,
} from "@awe/core";
import type { Config } from "../config.js";
import { requireAppAuth } from "./context.js";
import { VisionError, VisionService } from "../services/vision.js";
import { NotFoundError } from "../services/meal-service.js";
import { RateLimiter } from "../middleware/rate-limit.js";

/** The REST API the mobile app talks to. Same service layer as the MCP tools. */
export function createApiRouter(config: Config, vision = new VisionService(config)): Router {
  const router = Router();
  const auth = requireAppAuth(config);
  const visionLimiter = new RateLimiter(config.RATE_LIMIT_VISION_PER_HOUR, 60 * 60 * 1000);
  const apiLimiter = new RateLimiter(config.RATE_LIMIT_API_PER_MINUTE, 60 * 1000);

  router.use(auth, (req, res, next) => {
    if (!apiLimiter.check(req.userId!).allowed) {
      res.status(429).json({ error: "rate_limited", message: "Slow down a moment and try again." });
      return;
    }
    next();
  });

  router.get("/day", async (req, res) => {
    const date = typeof req.query["date"] === "string" ? req.query["date"] : undefined;
    res.json(await req.service!.getDay(date));
  });

  router.get("/week", async (req, res) => {
    const end = typeof req.query["end"] === "string" ? req.query["end"] : undefined;
    res.json(await req.service!.getWeek(end));
  });

  router.get("/history", async (req, res) => {
    const limit = Number(req.query["limit"] ?? 50);
    res.json(await req.service!.getHistory(Number.isFinite(limit) ? limit : 50));
  });

  router.get("/usual", async (req, res) => {
    const parsed = MealTypeSchema.safeParse(req.query["mealType"]);
    res.json(await req.service!.getUsual(parsed.success ? parsed.data : undefined));
  });

  router.get("/goals", async (req, res) => {
    res.json(await req.service!.getGoals());
  });

  router.put("/goals", async (req, res) => {
    const parsed = GoalsSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_goals", issues: parsed.error.issues });
      return;
    }
    res.json(await req.service!.saveGoals(parsed.data));
  });

  router.get("/barcode/:barcode", async (req, res) => {
    const parsed = BarcodeSchema.safeParse(req.params.barcode);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_barcode" });
      return;
    }
    const food = await req.service!.lookupBarcode(parsed.data);
    if (!food) {
      res.status(404).json({ error: "not_found", message: "That barcode isn't in the database yet." });
      return;
    }
    res.json(food);
  });

  const LogBarcodeSchema = z.object({
    barcode: BarcodeSchema,
    grams: z.number().min(1).max(3000),
    mealType: MealTypeSchema.optional(),
    loggedAt: z.string().datetime().optional(),
  });

  router.post("/meals/barcode", async (req, res) => {
    const parsed = LogBarcodeSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_request", issues: parsed.error.issues });
      return;
    }
    const food = await req.service!.lookupBarcode(parsed.data.barcode);
    if (!food) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    const opts: { mealType?: z.infer<typeof MealTypeSchema>; loggedAt?: string } = {};
    if (parsed.data.mealType) opts.mealType = parsed.data.mealType;
    if (parsed.data.loggedAt) opts.loggedAt = parsed.data.loggedAt;
    res.status(201).json(await req.service!.logBarcode(food, parsed.data.grams, opts));
  });

  /**
   * The plate read. Consent for sending a photo to Anthropic is captured in the
   * app before this is ever called (design doc §10.3); the client asserts it
   * here so the server refuses to forward an image without it.
   */
  const EstimateSchema = z.object({
    image: z.object({
      data: z.string().min(1).max(8_000_000),
      mediaType: z.string().min(3).max(40),
    }),
    mealType: MealTypeSchema.optional(),
    restaurantName: z.string().max(80).optional(),
    note: z.string().max(200).optional(),
    aiConsent: z.literal(true),
  });

  router.post("/meals/estimate", async (req, res) => {
    const parsed = EstimateSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: "invalid_request",
        message: parsed.error.issues.some((i) => i.path.includes("aiConsent"))
          ? "Photo estimation needs your permission to send the photo to Anthropic's Claude."
          : "That request was missing something.",
        issues: parsed.error.issues,
      });
      return;
    }
    if (!visionLimiter.check(req.userId!).allowed) {
      res.status(429).json({
        error: "rate_limited",
        message: "That's a lot of photos in one hour. Try again shortly, or log it by barcode.",
      });
      return;
    }
    try {
      const result = await vision.readPlate(parsed.data.image, {
        ...(parsed.data.mealType ? { mealType: parsed.data.mealType } : {}),
        restaurantName: parsed.data.restaurantName,
        note: parsed.data.note,
      });
      res.json(result);
    } catch (err) {
      if (err instanceof VisionError) {
        res.status(err.code === "invalid_image" || err.code === "not_food" ? 400 : 502).json({
          error: err.code,
          message: err.message,
        });
        return;
      }
      throw err;
    }
  });

  const LogVisionSchema = z.object({
    result: VisionResultSchema,
    answers: AnswersSchema.default({}),
    // Empty means the upload failed on the device. The estimate is still
    // worth keeping, so the entry logs without a photo rather than erroring.
    photoPath: z.string().max(300),
    mealType: MealTypeSchema.optional(),
    restaurantName: z.string().max(80).optional(),
    loggedAt: z.string().datetime().optional(),
  });

  router.post("/meals/photo", async (req, res) => {
    const parsed = LogVisionSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_request", issues: parsed.error.issues });
      return;
    }
    // Storage RLS stops a client uploading into someone else's folder; this
    // stops it *claiming* a path it doesn't own on an entry of its own.
    if (parsed.data.photoPath !== "" && !isOwnedPhotoPath(parsed.data.photoPath, req.userId!)) {
      res.status(400).json({
        error: "invalid_photo_path",
        message: "That photo path isn't one of yours.",
      });
      return;
    }
    const { result, answers, ...opts } = parsed.data;
    res.status(201).json(await req.service!.logFromVision(result, answers, opts));
  });

  router.patch("/meals/:id", async (req, res) => {
    const parsed = CorrectionInputSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_request", issues: parsed.error.issues });
      return;
    }
    try {
      res.json(await req.service!.correctEntry(req.params.id, parsed.data));
    } catch (err) {
      if (err instanceof NotFoundError) {
        res.status(404).json({ error: "not_found", message: err.message });
        return;
      }
      throw err;
    }
  });

  router.delete("/meals/:id", async (req, res) => {
    await req.service!.deleteEntry(req.params.id);
    res.status(204).end();
  });

  return router;
}

/** Errors are logged without payloads — no photos, macros or emails (design doc §10.5). */
export function errorHandler(isProduction: boolean) {
  return (err: unknown, req: Request, res: Response, _next: unknown): void => {
    const id = Math.random().toString(36).slice(2, 10);
    console.error(
      JSON.stringify({
        level: "error",
        requestId: id,
        method: req.method,
        path: req.path,
        message: err instanceof Error ? err.message : "unknown error",
      }),
    );
    res.status(500).json({
      error: "server_error",
      requestId: id,
      message: isProduction ? "Something went wrong on our side." : String(err),
    });
  };
}
