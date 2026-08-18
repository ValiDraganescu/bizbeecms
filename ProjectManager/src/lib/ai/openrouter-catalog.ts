import { parseModelCatalog, type CatalogModel } from "./model-catalog";

/**
 * Fetch + parse OpenRouter's PUBLIC model catalog (no API key). Shared by the
 * curation page's proxy route and the MCP `ai_models_*` tools. Throws on
 * upstream failure; callers map that to 502 / `ok:false`.
 */
const OPENROUTER_MODELS_URL = "https://openrouter.ai/api/v1/models";

export async function fetchOpenRouterCatalog(): Promise<CatalogModel[]> {
  const res = await fetch(OPENROUTER_MODELS_URL);
  if (!res.ok) throw new Error(`OpenRouter catalog HTTP ${res.status}`);
  return parseModelCatalog(await res.json());
}
