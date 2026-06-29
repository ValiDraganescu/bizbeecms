/**
 * Defensive boundary coercion for catalog models loaded from `/api/chat/models`
 * (ai-widget-ux goal — BUG [P1] model-picker crash).
 *
 * The picker consumes `j.models` from the API, whose payload may come from a D1
 * CACHE row written by an OLDER bundle — predating fields like `inputModalities`
 * / `inputPrice` / `outputPrice` that the renderer now reads. A cached row
 * missing `inputModalities` made the picker do `m.inputModalities.map(...)` on
 * `undefined` → "Cannot read properties of undefined (reading 'map')" and the
 * error boundary. The renderer must NOT trust the wire shape.
 *
 * PURE: backfills the optional/added fields so every entry is render-safe,
 * regardless of which bundle wrote the cache. node-tested
 * (`scripts/catalog-coerce.test.mjs`). Lives in the WIDGET's territory — does
 * NOT touch `models.ts` (ai-openrouter's). It only reuses the `CatalogModel`
 * type, so the boundary stays aligned as that type evolves.
 *
 * ponytail: thin field backfill, not a re-parse. The route already parses live
 * OpenRouter; this only heals stale-cache / older-shape rows at the UI edge.
 */
import type { CatalogModel } from "@/lib/chat/models";

/** Known input modalities (mirror of models.ts); junk is dropped, empty → ["text"]. */
const KNOWN_MODALITIES = new Set(["text", "image", "file", "audio", "video"]);

function coerceModalities(raw: unknown): string[] {
  if (!Array.isArray(raw)) return ["text"];
  const out = raw.filter((m): m is string => typeof m === "string" && KNOWN_MODALITIES.has(m));
  return out.length > 0 ? out : ["text"];
}

function coercePrice(raw: unknown): number | null {
  return typeof raw === "number" && Number.isFinite(raw) ? raw : null;
}

/** Backfill one wire entry to a render-safe `CatalogModel`, or null if unusable. */
export function coerceCatalogModel(raw: unknown): CatalogModel | null {
  if (!raw || typeof raw !== "object") return null;
  const m = raw as Record<string, unknown>;
  if (typeof m.id !== "string" || m.id.length === 0) return null;
  const id = m.id;
  const provider = typeof m.provider === "string" && m.provider ? m.provider : id.split("/")[0] || "other";
  const label = typeof m.label === "string" && m.label ? m.label : id.split("/").pop() || id;
  const inputPrice = coercePrice(m.inputPrice ?? m.price);
  return {
    id,
    label,
    provider,
    price: coercePrice(m.price ?? m.inputPrice),
    inputPrice,
    outputPrice: coercePrice(m.outputPrice),
    inputModalities: coerceModalities(m.inputModalities),
    contextLength:
      typeof m.contextLength === "number" && m.contextLength > 0 ? m.contextLength : null,
  };
}

/** Coerce a wire `models` array to render-safe `CatalogModel[]`, dropping junk. */
export function coerceCatalog(raw: unknown): CatalogModel[] {
  if (!Array.isArray(raw)) return [];
  const out: CatalogModel[] = [];
  for (const r of raw) {
    const m = coerceCatalogModel(r);
    if (m) out.push(m);
  }
  return out;
}
