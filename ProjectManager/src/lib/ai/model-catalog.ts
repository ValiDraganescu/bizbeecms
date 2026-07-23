/**
 * OpenRouter model catalog helpers for the curation page's model picker — a
 * port of the CMS's `lib/chat/models.ts` pure helpers (same wire, same shapes),
 * so the PM picker offers exactly what a Site's CMS picker would.
 *
 * `GET https://openrouter.ai/api/v1/models` returns an OpenAI-style
 * `{ data: [{ id, name, pricing, architecture, ... }] }` payload; `pricing`
 * fields are USD-per-token strings. Parsing keeps models that tool-call OR
 * output images (mirroring the CMS filter — anything else is unusable by any
 * CMS purpose's runtime).
 *
 * Pure and dependency-free (no `@/` alias, no React, no env) so it runs under a
 * bare `node --test` (model-catalog.test.ts).
 */

/** A catalog entry as the picker consumes it (the clean boundary shape). */
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
  /** Accepted input modalities; defaults to `["text"]`. */
  inputModalities: string[];
  /** Produced output modalities; defaults to `["text"]`. */
  outputModalities: string[];
  /** Context window in tokens; null when the API exposes none. */
  contextLength?: number | null;
}

/** The vendor segment of an OpenRouter id: `<vendor>/rest` → `vendor`. */
export function providerOf(id: string): string {
  const parts = id.split("/");
  return parts.length >= 1 && parts[0] ? parts[0] : "other";
}

/** Human label from an id: the last path segment (the model name). */
function labelOf(id: string): string {
  const parts = id.split("/");
  return parts[parts.length - 1] || id;
}

/** The OpenRouter list-models payload shape we care about (loose). */
interface RawModel {
  id?: unknown;
  name?: unknown;
  pricing?: { prompt?: unknown; completion?: unknown } | null;
  supported_parameters?: unknown;
  architecture?: { input_modalities?: unknown; output_modalities?: unknown } | null;
  context_length?: unknown;
}

/** Known modalities OpenRouter advertises — anything else is dropped as junk. */
const KNOWN_MODALITIES = new Set(["text", "image", "file", "audio", "video"]);

function parseModalities(mods: unknown): string[] {
  if (!Array.isArray(mods)) return ["text"];
  const out = mods.filter((m): m is string => typeof m === "string" && KNOWN_MODALITIES.has(m));
  return out.length > 0 ? out : ["text"];
}

/** True when the model advertises tool/function-calling support. */
function supportsTools(m: RawModel): boolean {
  const p = m.supported_parameters;
  return Array.isArray(p) && p.includes("tools");
}

/** Coerce a USD-per-token pricing field (string|number) to a finite number, else null. */
function toPrice(raw: unknown): number | null {
  const n = typeof raw === "string" ? Number(raw) : typeof raw === "number" ? raw : NaN;
  return Number.isFinite(n) ? n : null;
}

function priceField(m: RawModel, field: "prompt" | "completion"): number | null {
  const p = m.pricing;
  if (!p || typeof p !== "object") return null;
  return toPrice((p as Record<string, unknown>)[field]);
}

/** Format a USD-per-token price as USD per 1M tokens, 2 decimals (`null` → null). */
export function pricePerMillion(usdPerToken: number | null): string | null {
  if (usdPerToken == null) return null;
  return (usdPerToken * 1_000_000).toFixed(2);
}

/**
 * Parse the OpenRouter list-models JSON (`{ data: RawModel[] }` or a bare
 * `RawModel[]`) into the clean `CatalogModel[]`. Junk entries (no string `id`)
 * are dropped, as are models that neither tool-call nor output images — no CMS
 * purpose can run those.
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
    const outputModalities = parseModalities(
      m.architecture && typeof m.architecture === "object"
        ? m.architecture.output_modalities
        : undefined,
    );
    if (!supportsTools(m) && !outputModalities.includes("image")) continue;
    const input = priceField(m, "prompt");
    out.push({
      id: m.id,
      label: typeof m.name === "string" && m.name.trim() ? m.name.trim() : labelOf(m.id),
      provider: providerOf(m.id),
      price: input,
      inputPrice: input,
      outputPrice: priceField(m, "completion"),
      inputModalities: parseModalities(
        m.architecture && typeof m.architecture === "object"
          ? m.architecture.input_modalities
          : undefined,
      ),
      outputModalities,
      contextLength:
        typeof m.context_length === "number" && m.context_length > 0
          ? m.context_length
          : null,
    });
  }
  return out;
}

/** Group a catalog by provider → entries; groups A→Z, each LOW→HIGH price. */
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
 * Keep only models that accept EVERY required input modality (AND). An empty
 * `required` keeps the whole catalog.
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

/**
 * Keep only models that PRODUCE every required output modality (AND). Used to
 * find image-GENERATION models (`["image"]`).
 */
export function filterByOutputModalities(
  catalog: ReadonlyArray<CatalogModel>,
  required: ReadonlyArray<string>,
): CatalogModel[] {
  if (required.length === 0) return [...catalog];
  return catalog.filter((m) => {
    const have = new Set(m.outputModalities ?? ["text"]);
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
