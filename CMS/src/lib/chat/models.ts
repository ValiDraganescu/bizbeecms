/**
 * Model catalog for the CMS AI assistant (ai-openrouter goal — provider swap).
 *
 * The picker is backed by the OpenRouter catalog, fetched from OpenRouter's
 * `GET https://openrouter.ai/api/v1/models` endpoint, parsed by the PURE helpers
 * here, cached in D1, and served by `GET /api/chat/models`. The static list
 * below stays as the FALLBACK (and the default) for when the catalog can't be
 * fetched (offline / upstream down) or the cache is empty — the picker is never
 * empty and the default is always known.
 *
 * (Was Cloudflare Workers-AI: ids like `@cf/<vendor>/...` via the CF list-models
 * API. The ai-openrouter goal moved the assistant onto OpenRouter, whose ids are
 * provider-prefixed `vendor/model` and whose `/api/v1/models` returns an OpenAI-
 * style `{ data: [{ id, name, pricing: { prompt } }] }` payload.)
 *
 * The `model` field on the chat route is UNTRUSTED, so it must NEVER 400: the
 * route validates the chosen id against the cached catalog ids (or the static
 * fallback) and falls back to DEFAULT_MODEL for anything unknown. Arbitrary
 * model strings are never forwarded upstream.
 *
 * PURE module: no React / D1 / CF imports, so it's node-testable (see
 * `scripts/models.test.mjs`) and importable by both the route and the widget.
 */

/** Default OpenRouter model — the route's fallback. Must be in CHAT_MODELS. */
export const DEFAULT_MODEL = "openai/gpt-4o-mini";

/** A catalog entry as the UI + route consume it (the clean boundary shape). */
export interface CatalogModel {
  /** Exact OpenRouter model id, e.g. `openai/gpt-4o-mini`. */
  id: string;
  /** Display label (the model's human name, or the tail of the id). */
  label: string;
  /** Provider grouping axis — the vendor segment of `<vendor>/model`. */
  provider: string;
  /** Per-input-token USD price (sort key); null when the API exposes none. */
  price: number | null;
  /** Per-input-token USD price (= `price`); null when none. For display. */
  inputPrice: number | null;
  /** Per-output-token USD price (`pricing.completion`); null when none. */
  outputPrice: number | null;
}

/**
 * Static fallback catalog of OpenRouter chat models that support OpenAI-style
 * tool calling (the assistant relies on tools). Used when the live catalog is
 * unavailable. `price` left null — sorted purely by the live catalog when present.
 */
export const CHAT_MODELS: ReadonlyArray<CatalogModel> = [
  {
    id: "openai/gpt-4o-mini",
    label: "GPT-4o mini (fast)",
    provider: "openai",
    price: null,
    inputPrice: null,
    outputPrice: null,
  },
  {
    id: "openai/gpt-4o",
    label: "GPT-4o (strong)",
    provider: "openai",
    price: null,
    inputPrice: null,
    outputPrice: null,
  },
  {
    id: "anthropic/claude-3.5-sonnet",
    label: "Claude 3.5 Sonnet",
    provider: "anthropic",
    price: null,
    inputPrice: null,
    outputPrice: null,
  },
  {
    id: "google/gemini-flash-1.5",
    label: "Gemini Flash 1.5",
    provider: "google",
    price: null,
    inputPrice: null,
    outputPrice: null,
  },
];

// ── Pure catalog helpers (node-tested) ──────────────────────────────────────

/** The vendor segment of an OpenRouter id: `<vendor>/rest` → `vendor`. */
export function providerOf(id: string): string {
  // ids look like "openai/gpt-4o-mini" or "anthropic/claude-3.5-sonnet".
  const parts = id.split("/");
  return parts.length >= 1 && parts[0] ? parts[0] : "other";
}

/** Human label from an id: the last path segment (the model name). */
function labelOf(id: string): string {
  const parts = id.split("/");
  return parts[parts.length - 1] || id;
}

/**
 * The OpenRouter list-models payload shape we care about (loose — the API
 * carries far more; we read only what we need so it's resilient to additions).
 * `pricing.prompt` is a USD-per-token string, e.g. "0.00000015".
 */
interface RawModel {
  id?: unknown;
  name?: unknown;
  pricing?: { prompt?: unknown; completion?: unknown } | null;
  /** OpenRouter exposes supported request params; includes "tools" when the model can tool-call. */
  supported_parameters?: unknown;
}

/** True when the model advertises tool/function-calling support (`supported_parameters` includes "tools"). */
function supportsTools(m: RawModel): boolean {
  const p = m.supported_parameters;
  return Array.isArray(p) && p.includes("tools");
}

/** Coerce a USD-per-token pricing field (string|number) to a finite number, else null. */
function toPrice(raw: unknown): number | null {
  const n = typeof raw === "string" ? Number(raw) : typeof raw === "number" ? raw : NaN;
  return Number.isFinite(n) ? n : null;
}

/** Extract the per-input-token price (USD/token) from `pricing.prompt`, or null. */
function priceOf(m: RawModel): number | null {
  const p = m.pricing;
  if (!p || typeof p !== "object") return null;
  return toPrice((p as { prompt?: unknown }).prompt);
}

/** Extract the per-output-token price (USD/token) from `pricing.completion`, or null. */
function outputPriceOf(m: RawModel): number | null {
  const p = m.pricing;
  if (!p || typeof p !== "object") return null;
  return toPrice((p as { completion?: unknown }).completion);
}

/** Format a USD-per-token price as USD per 1M tokens, 2 decimals (`null` → null). */
export function pricePerMillion(usdPerToken: number | null): string | null {
  if (usdPerToken == null) return null;
  return (usdPerToken * 1_000_000).toFixed(2);
}

/**
 * Parse the OpenRouter list-models JSON (`{ data: RawModel[] }` or a bare
 * `RawModel[]`) into the clean `CatalogModel[]`. Resilient to a missing `data`
 * wrapper and junk entries (anything without a string `id` is dropped). Models
 * that don't advertise tool-calling (`supported_parameters` lacking "tools")
 * are also dropped — the assistant is tool-driven, so they're unusable here.
 */
export function parseModelCatalog(apiJson: unknown): CatalogModel[] {
  const raw: unknown =
    apiJson && typeof apiJson === "object" && "data" in (apiJson as object)
      ? (apiJson as { data: unknown }).data
      : apiJson;
  const list: RawModel[] = Array.isArray(raw) ? (raw as RawModel[]) : [];
  const out: CatalogModel[] = [];
  for (const m of list) {
    if (!m || typeof m.id !== "string" || m.id.length === 0) continue;
    // The assistant is tool-driven; models without tool-calling are useless in the picker.
    if (!supportsTools(m)) continue;
    const input = priceOf(m);
    out.push({
      id: m.id,
      label: typeof m.name === "string" && m.name.trim() ? m.name.trim() : labelOf(m.id),
      provider: providerOf(m.id),
      price: input,
      inputPrice: input,
      outputPrice: outputPriceOf(m),
    });
  }
  return out;
}

/** Group a catalog by provider → entries (insertion order of first sighting). */
export function groupByProvider(
  catalog: ReadonlyArray<CatalogModel>,
): Array<{ provider: string; models: CatalogModel[] }> {
  const groups = new Map<string, CatalogModel[]>();
  for (const m of catalog) {
    const g = groups.get(m.provider) ?? [];
    g.push(m);
    groups.set(m.provider, g);
  }
  return [...groups.entries()]
    .map(([provider, models]) => ({ provider, models: sortByPrice(models) }))
    .sort((a, b) => a.provider.localeCompare(b.provider));
}

/** Sort a group of models LOW→HIGH price; null prices sort LAST. */
export function sortByPrice(models: ReadonlyArray<CatalogModel>): CatalogModel[] {
  return [...models].sort((a, b) => {
    if (a.price == null && b.price == null) return a.label.localeCompare(b.label);
    if (a.price == null) return 1;
    if (b.price == null) return -1;
    return a.price - b.price;
  });
}

/** Case-insensitive filter over id/label/provider. Empty query → all. */
export function filterCatalog(
  catalog: ReadonlyArray<CatalogModel>,
  query: string,
): CatalogModel[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...catalog];
  return catalog.filter(
    (m) =>
      m.id.toLowerCase().includes(q) ||
      m.label.toLowerCase().includes(q) ||
      m.provider.toLowerCase().includes(q),
  );
}

// ── Untrusted model resolution ──────────────────────────────────────────────

const STATIC_IDS = new Set(CHAT_MODELS.map((m) => m.id));

/**
 * Is `id` a known model id? Checks the static fallback set plus an optional
 * dynamic allowlist (the cached catalog ids). The route passes the cached ids;
 * the widget can call it with no arg for the static set.
 */
export function isKnownModel(id: unknown, allowed?: ReadonlySet<string>): id is string {
  if (typeof id !== "string" || id.length === 0) return false;
  return STATIC_IDS.has(id) || (allowed ? allowed.has(id) : false);
}

/**
 * Resolve an UNTRUSTED model value to a safe id: the value if it's known (static
 * or in the supplied catalog allowlist), otherwise the default. Never throws,
 * never returns an arbitrary string.
 */
export function resolveModel(value: unknown, allowed?: ReadonlySet<string>): string {
  return isKnownModel(value, allowed) ? value : DEFAULT_MODEL;
}
