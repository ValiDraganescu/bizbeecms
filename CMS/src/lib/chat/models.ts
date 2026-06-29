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

/**
 * Default model for AI image description (searchable media). A cheap multimodal
 * model that accepts `image` input. Operator-overridable in CMS settings; this
 * is the fallback when unset or when the saved id isn't image-capable.
 */
export const DEFAULT_IMAGE_MODEL = "openai/gpt-4o-mini";

/**
 * Default model for AI content translation (page/component text → other locales).
 * A capable, inexpensive text model. Operator-overridable in CMS settings; this
 * is the fallback when unset or when the saved id isn't in the catalog.
 */
export const DEFAULT_TRANSLATE_MODEL = "openai/gpt-4o-mini";

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
  /** Accepted input modalities (`architecture.input_modalities`); defaults to `["text"]`. */
  inputModalities: string[];
  /** Context window in tokens (`context_length`); null/absent when the API exposes none. */
  contextLength?: number | null;
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
    inputModalities: ["text"],
  },
  {
    id: "openai/gpt-4o",
    label: "GPT-4o (strong)",
    provider: "openai",
    price: null,
    inputPrice: null,
    outputPrice: null,
    inputModalities: ["text"],
  },
  {
    id: "anthropic/claude-3.5-sonnet",
    label: "Claude 3.5 Sonnet",
    provider: "anthropic",
    price: null,
    inputPrice: null,
    outputPrice: null,
    inputModalities: ["text"],
  },
  {
    id: "google/gemini-flash-1.5",
    label: "Gemini Flash 1.5",
    provider: "google",
    price: null,
    inputPrice: null,
    outputPrice: null,
    inputModalities: ["text"],
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
  /** OpenRouter's modality metadata; `input_modalities` lists accepted inputs (text/image/file/…). */
  architecture?: { input_modalities?: unknown } | null;
  /** Context window size in tokens. */
  context_length?: unknown;
}

/** Known input modalities OpenRouter advertises — anything else is dropped as junk. */
const KNOWN_MODALITIES = new Set(["text", "image", "file", "audio", "video"]);

/**
 * Accepted input modalities from `architecture.input_modalities`. Keeps only the
 * known string modalities; defaults to `["text"]` when absent/empty/junk (every
 * model accepts text). Pure — node-tested.
 */
export function parseInputModalities(raw: unknown): string[] {
  const arch = raw && typeof raw === "object" ? (raw as RawModel).architecture : null;
  const mods = arch && typeof arch === "object" ? arch.input_modalities : undefined;
  if (!Array.isArray(mods)) return ["text"];
  const out = mods.filter((m): m is string => typeof m === "string" && KNOWN_MODALITIES.has(m));
  return out.length > 0 ? out : ["text"];
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

/**
 * Per-turn output-token cap derived from the SELECTED model's context window.
 * The window covers input+output, so we let output use a QUARTER of it (leaving
 * the bulk for the prompt + tool results) and clamp to MAX_OUTPUT_CEILING so a
 * giant-window model (e.g. 2M) can't bill one enormous completion. Returns
 * `undefined` when the window is unknown — the adapter then applies its own
 * default. A floor keeps tiny-window models from getting a uselessly small cap.
 */
export const MAX_OUTPUT_CEILING = 32_000;
export const MIN_OUTPUT_FLOOR = 1_000;
export function outputCapFor(contextLength: number | null | undefined): number | undefined {
  if (typeof contextLength !== "number" || contextLength <= 0) return undefined;
  const quarter = Math.floor(contextLength / 4);
  return Math.max(MIN_OUTPUT_FLOOR, Math.min(MAX_OUTPUT_CEILING, quarter));
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
      inputModalities: parseInputModalities(m),
      contextLength:
        typeof m.context_length === "number" && m.context_length > 0
          ? m.context_length
          : null,
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

/**
 * Keep only models that accept EVERY required input modality (AND, not OR). An
 * empty `required` keeps the whole catalog. A model with no declared modalities
 * is treated as text-only (the catalog default).
 */
export function filterByModalities(
  catalog: ReadonlyArray<CatalogModel>,
  required: ReadonlyArray<string>,
): CatalogModel[] {
  if (required.length === 0) return [...catalog];
  return catalog.filter((m) => {
    const have = new Set(m.inputModalities ?? ["text"]);
    return required.every((r) => have.has(r));
  });
}

/** All distinct input modalities present in the catalog, in a stable order. */
export function catalogModalities(catalog: ReadonlyArray<CatalogModel>): string[] {
  const ORDER = ["text", "image", "file", "audio", "video"];
  const seen = new Set<string>();
  for (const m of catalog) for (const mod of m.inputModalities ?? ["text"]) seen.add(mod);
  const known = ORDER.filter((o) => seen.has(o));
  const extra = [...seen].filter((s) => !ORDER.includes(s)).sort();
  return [...known, ...extra];
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

/**
 * Resolve an UNTRUSTED image-model value: the value if it's in the supplied
 * image-capable allowlist, else `DEFAULT_IMAGE_MODEL`. The caller builds the
 * allowlist from the catalog filtered to `image` input. Never throws.
 */
export function resolveImageModel(value: unknown, imageAllowed?: ReadonlySet<string>): string {
  if (typeof value === "string" && value.length > 0 && imageAllowed?.has(value)) {
    return value;
  }
  return DEFAULT_IMAGE_MODEL;
}

/**
 * Resolve an UNTRUSTED translation-model value: the value if it's in the supplied
 * allowlist (any text model from the catalog), else `DEFAULT_TRANSLATE_MODEL`.
 * Never throws — mirrors resolveImageModel.
 */
export function resolveTranslateModel(value: unknown, allowed?: ReadonlySet<string>): string {
  if (typeof value === "string" && value.length > 0 && allowed?.has(value)) {
    return value;
  }
  return DEFAULT_TRANSLATE_MODEL;
}
