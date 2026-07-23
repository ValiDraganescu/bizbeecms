/**
 * AI image GENERATION (text→image) for the gallery (ai-image-gen goal).
 *
 * The assistant's `generate_image` tool calls an OpenRouter model that can OUTPUT
 * the `image` modality (e.g. google/gemini-2.5-flash-image-preview). OpenRouter
 * exposes this through the SAME OpenAI-compatible chat-completions endpoint as
 * describe/chat: you send `modalities: ["image", "text"]` and the non-streaming
 * reply carries the image in `choices[0].message.images[].image_url.url` as a
 * `data:<mime>;base64,…` URL.
 *
 * PURE (no React/D1/CF imports) so it's node-testable like describe-image: the
 * route/handler resolves the model + OpenRouter key and passes them in. The live
 * HTTP call is HITL; the prompt-build + response-parse are unit-tested.
 *
 * ponytail: a standalone non-streaming `fetch` POST, not a method on the streaming
 * `Ai` port — same shape as describeImage.
 */

import { parseUsageCost } from "./sse.ts";

/** OpenRouter's OpenAI-compatible chat-completions endpoint (same as chat/describe). */
const OPENROUTER_CHAT_URL = "https://openrouter.ai/api/v1/chat/completions";

/** Minimal `fetch` surface (so tests can fake it), mirroring describe-image. */
export type FetchLike = (
  url: string,
  init: { method: string; headers: Record<string, string>; body: string },
) => Promise<{ ok: boolean; status: number; text(): Promise<string> }>;

/** A decoded generated image: raw bytes + the MIME type parsed from its data URL. */
export interface GeneratedImage {
  bytes: ArrayBuffer;
  contentType: string;
}

/** Build the request messages for a one-shot image generation from a text prompt. */
export function buildGenerateMessages(prompt: string): unknown[] {
  return [{ role: "user", content: prompt }];
}

/**
 * Pull the FIRST generated image's data URL out of a non-streaming OpenRouter
 * completion. OpenRouter image models return them under
 * `choices[0].message.images[].image_url.url`. Returns "" when absent (the caller
 * treats that as a failed generation). Pure — node-tested.
 */
export function parseGeneratedImageUrl(rawBody: string): string {
  try {
    const json = JSON.parse(rawBody) as {
      choices?: { message?: { images?: { image_url?: { url?: unknown } }[] } }[];
    };
    const images = json.choices?.[0]?.message?.images;
    if (!Array.isArray(images)) return "";
    for (const img of images) {
      const url = img?.image_url?.url;
      if (typeof url === "string" && url.startsWith("data:image/")) return url;
    }
    return "";
  } catch {
    return "";
  }
}

/**
 * Decode a `data:<mime>;base64,<payload>` URL to bytes + MIME. Returns null for
 * anything that isn't a base64 image data URL (the only shape OpenRouter returns).
 * Pure — node-tested. (`atob` is available on Workers and in Node ≥16.)
 */
export function decodeDataUrl(dataUrl: string): GeneratedImage | null {
  const m = /^data:(image\/[a-z0-9.+-]+);base64,(.+)$/i.exec(dataUrl);
  if (!m) return null;
  const contentType = m[1].toLowerCase();
  try {
    const binary = atob(m[2]);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return { bytes: bytes.buffer, contentType };
  } catch {
    return null;
  }
}

/**
 * A completed generation attempt: the decoded image (null on any failure — no
 * key/model, HTTP error, no image in the reply, bad data URL) plus what the
 * provider charged. The cost is reported EVEN when the image is null: a reply
 * we couldn't use was still billed, and the meter must see it.
 */
export interface GenerateImageResult {
  image: GeneratedImage | null;
  /** `usage.cost` in USD; undefined when upstream reported none. */
  cost?: number;
}

/**
 * Generate one image from a text prompt via a non-streaming OpenRouter completion.
 * Never throws — the caller surfaces a recoverable error when `image` is null.
 * `key`/`model` are resolved by the caller; `fetchImpl` is injectable for tests.
 */
export async function generateImage(
  prompt: string,
  model: string,
  key: string,
  fetchImpl: FetchLike = fetch as unknown as FetchLike,
): Promise<GenerateImageResult> {
  if (!key || !model || !prompt.trim()) return { image: null };
  try {
    const res = await fetchImpl(OPENROUTER_CHAT_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: buildGenerateMessages(prompt),
        modalities: ["image", "text"],
        stream: false,
        // Actual charged cost in the reply body — image pricing is per-image,
        // which token math cannot express. (docs/ai-cost-quotas.md)
        usage: { include: true },
      }),
    });
    if (!res.ok) return { image: null };
    const raw = await res.text();
    const cost = parseUsageCost(raw);
    const url = parseGeneratedImageUrl(raw);
    return {
      image: url ? decodeDataUrl(url) : null,
      ...(cost === undefined ? {} : { cost }),
    };
  } catch {
    return { image: null };
  }
}
