import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { VISION_SYSTEM_PROMPT, VisionResultSchema, visionUserPrompt, type VisionResult } from "@awe/core";
import type { Config } from "../config.js";

/** Images Anthropic accepts. Anything else is rejected before it costs a call. */
export const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;
export type AllowedImageType = (typeof ALLOWED_IMAGE_TYPES)[number];

/** §10.5: validated server-side before anything is forwarded to Claude. */
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export function isAllowedImageType(t: string): t is AllowedImageType {
  return (ALLOWED_IMAGE_TYPES as readonly string[]).includes(t);
}

export class VisionError extends Error {
  constructor(
    message: string,
    readonly code: "invalid_image" | "not_food" | "model_error",
  ) {
    super(message);
    this.name = "VisionError";
  }
}

/**
 * The plate read (design doc §5.3). Claude returns components and questions;
 * we do the arithmetic ourselves, so the numbers are reproducible and the
 * model can never hand us a total we didn't compute.
 */
export class VisionService {
  private readonly client: Anthropic;

  constructor(private readonly config: Config, client?: Anthropic) {
    this.client = client ?? new Anthropic({ apiKey: config.ANTHROPIC_API_KEY });
  }

  async readPlate(
    image: { data: string; mediaType: string },
    context: { mealType?: string; restaurantName?: string | undefined; note?: string | undefined } = {},
  ): Promise<VisionResult> {
    if (!isAllowedImageType(image.mediaType)) {
      throw new VisionError(`Unsupported image type ${image.mediaType}`, "invalid_image");
    }
    // base64 inflates by ~4/3; check the decoded size.
    if ((image.data.length * 3) / 4 > MAX_IMAGE_BYTES) {
      throw new VisionError("That photo is too large. It should be resized on the device first.", "invalid_image");
    }

    const response = await this.client.messages.parse({
      model: this.config.VISION_MODEL,
      max_tokens: 4096,
      system: VISION_SYSTEM_PROMPT,
      output_config: { format: zodOutputFormat(VisionResultSchema) },
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: image.mediaType, data: image.data } },
            { type: "text", text: visionUserPrompt(context) },
          ],
        },
      ],
    });

    if (response.stop_reason === "refusal") {
      throw new VisionError("The model declined to read that photo.", "model_error");
    }

    const parsed = VisionResultSchema.safeParse(response.parsed_output);
    if (!parsed.success) {
      throw new VisionError("The estimate came back in an unexpected shape.", "model_error");
    }
    if (parsed.data.notFood || parsed.data.components.length === 0) {
      throw new VisionError("That doesn't look like food. Try another photo.", "not_food");
    }
    return parsed.data;
  }
}
