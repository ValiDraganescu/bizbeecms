/**
 * Model allowlist for the CMS AI assistant (Milestone 2, ai-assistant goal,
 * Slice 4 sub-slice 2 — model picker).
 *
 * The binding-adapters `Ai` port exposes no curated model list, so we keep a
 * small hard-coded allowlist of Cloudflare Workers-AI models that support
 * OpenAI-style tool calling (the assistant relies on tools). The widget lets the
 * operator pick one; the route validates the chosen id against this list and
 * falls back to the default for anything unknown — the `model` field is
 * UNTRUSTED, so it must NEVER 400 (same contract as `context`); arbitrary model
 * strings are never forwarded to `env.AI.run`.
 *
 * PURE module: no React / D1 / CF imports, so it's node-testable (see
 * `scripts/models.test.mjs`) and importable by both the route and the widget.
 */

/** Default Workers AI model — the route's fallback. Must be in CHAT_MODELS. */
export const DEFAULT_MODEL = "@cf/meta/llama-3.1-8b-instruct";

/**
 * Allowlisted Cloudflare Workers-AI chat models known to support tool calling.
 * `id` is the exact `env.AI.run(model, ...)` string; `label` is what the picker
 * shows (not localized — model names are proper nouns). Keep this short and
 * curated; do not expose arbitrary ids.
 */
export const CHAT_MODELS: ReadonlyArray<{ id: string; label: string }> = [
  { id: "@cf/meta/llama-3.1-8b-instruct", label: "Llama 3.1 8B (fast)" },
  { id: "@cf/meta/llama-3.3-70b-instruct-fp8-fast", label: "Llama 3.3 70B (strong)" },
  { id: "@hf/nousresearch/hermes-2-pro-mistral-7b", label: "Hermes 2 Pro 7B (tools)" },
];

const ALLOWED = new Set(CHAT_MODELS.map((m) => m.id));

/** Is `id` an allowlisted model id? */
export function isKnownModel(id: unknown): id is string {
  return typeof id === "string" && ALLOWED.has(id);
}

/**
 * Resolve an UNTRUSTED model value to a safe id: the value if it's allowlisted,
 * otherwise the default. Never throws, never returns an arbitrary string.
 */
export function resolveModel(value: unknown): string {
  return isKnownModel(value) ? value : DEFAULT_MODEL;
}
