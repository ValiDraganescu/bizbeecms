/**
 * Model catalog for the CMS AI assistant (Milestone 2, ai-assistant goal).
 *
 * Originally a tiny hard-coded allowlist (Slice 4 sub-slice 2). Now the picker
 * is backed by the FULL Cloudflare Workers-AI catalog, fetched from the CF
 * list-models API, parsed by the PURE helpers here, cached in D1, and served by
 * `GET /api/chat/models`. The static list below stays as the FALLBACK (and the
 * default) for when the catalog can't be fetched (no CF creds / offline) or the
 * cache is empty — the picker is never empty and the default is always known.
 *
 * The `model` field on the chat route is UNTRUSTED, so it must NEVER 400: the
 * route validates the chosen id against the cached catalog ids (or the static
 * fallback) and falls back to DEFAULT_MODEL for anything unknown. Arbitrary
 * model strings are never forwarded to `env.AI.run`.
 *
 * PURE module: no React / D1 / CF imports, so it's node-testable (see
 * `scripts/models.test.mjs`) and importable by both the route and the widget.
 */

/** Default Workers AI model — the route's fallback. Must be in CHAT_MODELS. */
export const DEFAULT_MODEL = "@cf/meta/llama-3.1-8b-instruct";

/** A catalog entry as the UI + route consume it (the clean boundary shape). */
export interface CatalogModel {
  /** Exact `env.AI.run(model, ...)` id, e.g. `@cf/meta/llama-3.1-8b-instruct`. */
  id: string;
  /** Display label (the human-ish tail of the id, or the description). */
  label: string;
  /** Provider grouping axis — the vendor segment of `@cf/<vendor>/...`. */
  provider: string;
  /** Per-input-token USD price (sort key); null when the API exposes none. */
  price: number | null;
}

/**
 * Static fallback catalog of Cloudflare Workers-AI chat models known to support
 * OpenAI-style tool calling (the assistant relies on tools). Used when the live
 * catalog is unavailable. `provider`/`price` filled to match the catalog shape.
 */
export const CHAT_MODELS: ReadonlyArray<CatalogModel> = [
  {
    id: "@cf/meta/llama-3.1-8b-instruct",
    label: "Llama 3.1 8B (fast)",
    provider: "meta",
    price: null,
  },
  {
    id: "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
    label: "Llama 3.3 70B (strong)",
    provider: "meta",
    price: null,
  },
  {
    id: "@hf/nousresearch/hermes-2-pro-mistral-7b",
    label: "Hermes 2 Pro 7B (tools)",
    provider: "nousresearch",
    price: null,
  },
];

// ── Pure catalog helpers (node-tested) ──────────────────────────────────────

/** The vendor segment of a CF model id: `@cf/<vendor>/rest` → `vendor`. */
export function providerOf(id: string): string {
  // ids look like "@cf/meta/llama-3.1-8b-instruct" or "@hf/nous/...".
  const parts = id.split("/");
  return parts.length >= 2 ? parts[1] : "other";
}

/** Human label from an id: the last path segment (the model name). */
function labelOf(id: string): string {
  const parts = id.split("/");
  return parts[parts.length - 1] || id;
}

/**
 * The CF list-models payload shape we care about (loose — the API carries far
 * more; we read only what we need so it's resilient to additions).
 */
interface RawModel {
  name?: unknown;
  description?: unknown;
  deprecated?: unknown;
  task?: { name?: unknown } | null;
  properties?: Array<{ property_id?: unknown; value?: unknown }> | null;
}

/** Extract the per-input-token price from a model's `properties[]`, or null. */
function priceOf(m: RawModel): number | null {
  const props = Array.isArray(m.properties) ? m.properties : [];
  const price = props.find((p) => p && p.property_id === "price");
  if (!price) return null;
  // `value` is either an array of {unit, price, currency} or a scalar.
  const val = price.value;
  const pick = (entry: unknown): number | null => {
    if (entry && typeof entry === "object") {
      const e = entry as { unit?: unknown; price?: unknown };
      const unit = typeof e.unit === "string" ? e.unit.toLowerCase() : "";
      const n = typeof e.price === "string" ? Number(e.price) : (e.price as number);
      if (typeof n === "number" && Number.isFinite(n) && unit.includes("input")) {
        return n;
      }
    }
    return null;
  };
  if (Array.isArray(val)) {
    // Prefer an input-token price; else the first finite price.
    for (const entry of val) {
      const p = pick(entry);
      if (p != null) return p;
    }
    for (const entry of val) {
      if (entry && typeof entry === "object") {
        const e = entry as { price?: unknown };
        const n = typeof e.price === "string" ? Number(e.price) : (e.price as number);
        if (typeof n === "number" && Number.isFinite(n)) return n;
      }
    }
  }
  return null;
}

/**
 * Parse the CF list-models JSON (`{ result: RawModel[] }` or `RawModel[]`) into
 * the clean `CatalogModel[]`. Drops deprecated models and anything that isn't a
 * Text-Generation task (the assistant needs chat models). Resilient to a missing
 * `result` wrapper (the public mirror returns a bare array).
 */
export function parseModelCatalog(apiJson: unknown): CatalogModel[] {
  const raw: unknown =
    apiJson && typeof apiJson === "object" && "result" in (apiJson as object)
      ? (apiJson as { result: unknown }).result
      : apiJson;
  const list: RawModel[] = Array.isArray(raw) ? (raw as RawModel[]) : [];
  const out: CatalogModel[] = [];
  for (const m of list) {
    if (!m || typeof m.name !== "string" || m.name.length === 0) continue;
    if (m.deprecated === true) continue;
    const task = m.task && typeof m.task === "object" ? String(m.task.name ?? "") : "";
    if (task && task.toLowerCase() !== "text generation") continue;
    out.push({
      id: m.name,
      label: typeof m.description === "string" && m.description.trim()
        ? labelOf(m.name)
        : labelOf(m.name),
      provider: providerOf(m.name),
      price: priceOf(m),
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
