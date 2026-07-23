/**
 * AI image description for searchable media (epic: searchable media library).
 *
 * On upload, a vision model reads the image and returns a concise, search-
 * friendly description; we store it on the asset row so the gallery can be
 * searched by what an image DEPICTS, not just its filename.
 *
 * This module is PURE (no React/D1/CF imports) so it's node-testable like its
 * peers: the route resolves the model + OpenRouter key (via the existing
 * `effectiveOpenrouterKey` path) and passes them in. The live HTTP call is HITL
 * (can't run offline); the prompt-build + response-parse are unit-tested.
 *
 * ponytail: a standalone NON-STREAMING helper, not a method on the `Ai` port
 * (that port is streaming-only by contract). One small `fetch` POST.
 */

import { parseUsageCost } from "./sse.ts";

/** OpenRouter's OpenAI-compatible chat-completions endpoint (same as the chat). */
const OPENROUTER_CHAT_URL = "https://openrouter.ai/api/v1/chat/completions";

/** Cap the stored description so a runaway model reply can't bloat the row. */
export const MAX_DESCRIPTION_CHARS = 600;

/** Minimal `fetch` surface (so tests can fake it), mirroring OpenRouterAi. */
export type FetchLike = (
  url: string,
  init: { method: string; headers: Record<string, string>; body: string },
) => Promise<{ ok: boolean; status: number; text(): Promise<string> }>;

/**
 * Build the OpenAI-style message array for a one-shot image description. The
 * `imageUrl` is a `data:<mime>;base64,…` URI (or any http url the model can
 * fetch). System prompt steers toward terse, factual, keyword-rich output —
 * good for substring search, not marketing prose.
 */
export function buildDescribeMessages(imageUrl: string): unknown[] {
  return [
    {
      role: "system",
      content:
        "You describe images for a media library's SEARCH index. Reply with ONE " +
        "or two plain sentences naming the concrete subject, setting, notable " +
        "objects, colors, and any visible text. Be factual and keyword-rich; no " +
        "preamble, no markdown, no opinions. If the image is a logo/icon/diagram, " +
        "say so and name what it depicts.",
    },
    {
      role: "user",
      content: [
        { type: "text", text: "Describe this image for search." },
        { type: "image_url", image_url: { url: imageUrl } },
      ],
    },
  ];
}

/**
 * Pull the assistant text out of a non-streaming OpenRouter completion body and
 * normalize it (trim, collapse whitespace, bound length). Returns "" if the
 * shape is unexpected — the caller treats an empty description as "not described"
 * and never fails the upload over it.
 */
export function parseDescription(rawBody: string): string {
  let text = "";
  try {
    const json = JSON.parse(rawBody) as {
      choices?: { message?: { content?: unknown } }[];
    };
    const content = json.choices?.[0]?.message?.content;
    if (typeof content === "string") text = content;
    else if (Array.isArray(content)) {
      // Some providers return content as parts; concatenate any text parts.
      text = content
        .map((p) =>
          p && typeof p === "object" && typeof (p as { text?: unknown }).text === "string"
            ? (p as { text: string }).text
            : "",
        )
        .join(" ");
    }
  } catch {
    return "";
  }
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > MAX_DESCRIPTION_CHARS
    ? clean.slice(0, MAX_DESCRIPTION_CHARS).trimEnd()
    : clean;
}

/** A completed describe call: the cleaned text + what the provider charged (USD). */
export interface DescribeResult {
  /** Cleaned description; "" on any failure (the upload must still succeed). */
  description: string;
  /** `usage.cost` in USD, for metering; undefined when upstream reported none. */
  cost?: number;
}

/**
 * Describe one image via a non-streaming OpenRouter completion. Never throws:
 * any failure yields an empty description (and no cost), so an upload can't
 * fail over a bad describe. `key`/`model` are resolved by the caller;
 * `fetchImpl` is injectable for tests.
 */
export async function describeImage(
  imageUrl: string,
  model: string,
  key: string,
  fetchImpl: FetchLike = fetch as unknown as FetchLike,
): Promise<DescribeResult> {
  if (!key || !model) return { description: "" };
  try {
    const res = await fetchImpl(OPENROUTER_CHAT_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: buildDescribeMessages(imageUrl),
        stream: false,
        max_tokens: 300,
        // Actual charged cost in the reply body — the metering source of truth.
        usage: { include: true },
      }),
    });
    if (!res.ok) return { description: "" };
    const raw = await res.text();
    const cost = parseUsageCost(raw);
    return { description: parseDescription(raw), ...(cost === undefined ? {} : { cost }) };
  } catch {
    return { description: "" };
  }
}
