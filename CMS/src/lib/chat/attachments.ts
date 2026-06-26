/**
 * ai-attachments — pure helpers for chat file attachments. Dep-free, node-tested.
 *
 * Two jobs:
 *  1. Gate a file against the SELECTED model's `inputModalities` (from the catalog,
 *     `parseInputModalities` in ./models.ts) so we only attach what the model can read.
 *  2. Build the OpenAI-compatible (OpenRouter) inline content part — base64 data-URI —
 *     so any vision/file model actually sees the bytes (USER decision: inline, not URL).
 */

/** Modalities OpenRouter advertises; mirrors KNOWN_MODALITIES in ./models.ts. */
export type Modality = "text" | "image" | "file" | "audio" | "video";

/**
 * Map a MIME type to the input modality a model must support to read it.
 * `image/*`→image, `audio/*`→audio, `video/*`→video; everything else
 * (PDFs, docs, text files, unknown) is a `file` — OpenRouter's file content part.
 */
export function mimeToModality(mime: string): Modality {
  const m = mime.toLowerCase().split(";")[0].trim();
  if (m.startsWith("image/")) return "image";
  if (m.startsWith("audio/")) return "audio";
  if (m.startsWith("video/")) return "video";
  return "file";
}

/**
 * True when the selected model accepts a file of this MIME type, i.e. its
 * `inputModalities` includes the modality the MIME maps to. Missing/empty
 * modalities are treated as text-only (the catalog default), so non-text files
 * are rejected. Text-only models reject everything here (you don't "attach" text).
 */
export function acceptsFile(modelInputModalities: readonly string[], mime: string): boolean {
  const have = new Set(modelInputModalities.length > 0 ? modelInputModalities : ["text"]);
  return have.has(mimeToModality(mime));
}

/** Assemble a `data:<mime>;base64,<data>` URI from a raw base64 string. */
export function toDataUri(mime: string, base64: string): string {
  return `data:${mime};base64,${base64}`;
}

/** An OpenAI/OpenRouter chat message content part. */
export type ContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } }
  | { type: "file"; file: { filename: string; file_data: string } };

/**
 * Build the inline content part OpenRouter accepts for one attachment.
 * Images → `image_url` with a base64 data-URI; everything else → the `file`
 * content part (`file_data` data-URI + filename), which is what OpenRouter wants
 * for PDFs/docs. Audio/video map to `file` too — no dedicated part shape, and the
 * `acceptsFile` gate already kept them off non-supporting models.
 */
export function toInlineContentPart(mime: string, base64: string, name: string): ContentPart {
  const url = toDataUri(mime, base64);
  if (mimeToModality(mime) === "image") {
    return { type: "image_url", image_url: { url } };
  }
  return { type: "file", file: { filename: name, file_data: url } };
}
