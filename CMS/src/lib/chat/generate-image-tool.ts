/**
 * The `generate_image` AI tool (ai-image-gen goal): the assistant generates an
 * image from a text prompt; it lands in the gallery, gets a searchable AI
 * description (the SAME describe step as upload), and the optional tags the model
 * supplies. The generated asset's public `/media/<key>` URL is returned so the
 * assistant can drop it straight into a component/page.
 *
 * PURE schema + arg validation (no React/D1/CF) so it's node-testable; the live
 * generation + R2 write live in the route's handler (`handleGenerateImage`).
 */

import { normalizeTags } from "../components/tags.ts";

/** Cap the prompt so a runaway arg can't bloat the upstream request. */
export const MAX_GEN_PROMPT_CHARS = 2000;

export const GENERATE_IMAGE_TOOL = {
  type: "function" as const,
  function: {
    name: "generate_image",
    description:
      "Generate an image from a text prompt using the site's configured image-" +
      "generation model. The image is saved to the media gallery, automatically " +
      "described for search, and tagged. Returns the new asset's public URL — use " +
      "it directly in a component <img> src or an image prop. Write a detailed, " +
      "concrete prompt (subject, style, composition, colors). Optionally pass " +
      "`tags` to categorize the image in the gallery.",
    parameters: {
      type: "object",
      properties: {
        prompt: {
          type: "string",
          description:
            "What to generate — a detailed description of the desired image " +
            "(subject, style, composition, colors, mood).",
        },
        tags: {
          type: "array",
          items: { type: "string" },
          description: "Optional gallery tags to categorize the image, e.g. [\"hero\", \"team\"].",
        },
      },
      required: ["prompt"],
    },
  },
} as const;

export type GenerateImageInput =
  | { ok: true; prompt: string; tags: string[] }
  | { ok: false; error: string };

/**
 * Validate the model's args into a clean `{ prompt, tags }`. The prompt is
 * required and trimmed/bounded; tags are normalized (deduped, trimmed) and
 * default to []. Returns a recoverable error message on a missing/blank prompt —
 * never throws. PURE.
 */
export function validateGenerateImage(args: unknown): GenerateImageInput {
  const a = (typeof args === "object" && args !== null ? args : {}) as Record<string, unknown>;
  const rawPrompt = typeof a.prompt === "string" ? a.prompt.trim() : "";
  if (!rawPrompt) {
    return { ok: false, error: "prompt is required — describe the image to generate" };
  }
  const prompt =
    rawPrompt.length > MAX_GEN_PROMPT_CHARS ? rawPrompt.slice(0, MAX_GEN_PROMPT_CHARS) : rawPrompt;
  return { ok: true, prompt, tags: normalizeTags(a.tags) };
}
