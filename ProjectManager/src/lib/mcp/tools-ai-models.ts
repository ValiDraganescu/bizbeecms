/**
 * MCP tools for Settings → AI models (`/settings/ai-models`): browse the
 * OpenRouter catalog, read the curated per-purpose alias lists + credit pool,
 * and add / update / remove aliases. Same authz + persistence path as the UI
 * route (`/api/settings/ai-models`): Admin+ only, whole-catalog normalize →
 * `setCuratedPurposes`.
 */
import {
  AI_PURPOSES,
  canCurateAiModels,
  isAiPurpose,
  normalizeCuratedPurposes,
  type AiPurpose,
} from "@/lib/ai/curated";
import { addCuratedModel, removeCuratedModel, updateCuratedModel, type EditResult } from "@/lib/ai/curated-edit";
import {
  filterCatalog,
  filterCatalogForPurpose,
  pricePerMillion,
  sortByPrice,
  type CatalogModel,
} from "@/lib/ai/model-catalog";
import { fetchOpenRouterCatalog } from "@/lib/ai/openrouter-catalog";
import { getCreditPoolUsd, getCuratedPurposes, setCuratedPurposes } from "@/lib/ai/settings";
import type { ToolDef, ToolResult } from "./mcp-core";
import type { ToolCtx } from "./tools";

const PURPOSE_SCHEMA = {
  type: "string",
  enum: [...AI_PURPOSES],
  description:
    "The AI purpose (category): chatAgent (site chat agent), assistant (CMS AI assistant), " +
    "imageDescribe (alt-text/vision), imageGenerate (image generation), translate.",
} as const;

function forbidden(): ToolResult {
  return { ok: false, error: "notAllowed", message: "Only Admin or SuperAdmin users can manage AI models." };
}

function purposeArg(args: Record<string, unknown>): AiPurpose | ToolResult {
  if (isAiPurpose(args.purpose)) return args.purpose;
  return { ok: false, error: "purposeInvalid", message: `\`purpose\` must be one of: ${AI_PURPOSES.join(", ")}.` };
}

/** Compact catalog row for tool output (prices as USD per 1M tokens). */
function summarize(m: CatalogModel) {
  return {
    id: m.id,
    label: m.label,
    provider: m.provider,
    inputUsdPer1M: pricePerMillion(m.inputPrice),
    outputUsdPer1M: pricePerMillion(m.outputPrice),
    inputModalities: m.inputModalities,
    outputModalities: m.outputModalities,
    contextLength: m.contextLength ?? null,
  };
}

async function loadCatalog(): Promise<CatalogModel[] | ToolResult> {
  try {
    return await fetchOpenRouterCatalog();
  } catch (e) {
    return { ok: false, error: "upstream", message: `OpenRouter catalog unavailable: ${e instanceof Error ? e.message : String(e)}` };
  }
}

/** Persist an edit result through the same normalize path the UI PUT uses. */
async function persist(result: EditResult, purpose: AiPurpose): Promise<ToolResult> {
  if (!result.ok) return { ok: false, error: result.error, message: result.message };
  const { purposes, dropped } = normalizeCuratedPurposes(result.purposes);
  if (dropped > 0) {
    return { ok: false, error: "entryInvalid", message: "Every model needs an OpenRouter model id, and each alias may appear only once per purpose." };
  }
  await setCuratedPurposes(purposes);
  return { ok: true, purpose, entry: result.entry, models: purposes[purpose].models };
}

export const AI_MODEL_TOOLS: ReadonlyArray<ToolDef<ToolCtx>> = [
  {
    name: "ai_models_list_openrouter",
    description:
      "List OpenRouter models available for curation (tool-calling or image-output models only, " +
      "as the AI-models settings picker shows them). Filter with `query` (matches id/label/provider) " +
      "and/or `purpose` (applies that purpose's capability filter, e.g. imageGenerate → image-output " +
      "models). Sorted by input price low→high; `limit` caps the result (default 50). Admin+.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Case-insensitive substring over id, label, provider." },
        purpose: PURPOSE_SCHEMA,
        limit: { type: "integer", minimum: 1, maximum: 500, description: "Max rows (default 50)." },
      },
      additionalProperties: false,
    },
    run: async (args, ctx) => {
      if (!canCurateAiModels(ctx.user.role)) return forbidden();
      const catalog = await loadCatalog();
      if (!Array.isArray(catalog)) return catalog;
      let list: CatalogModel[] = catalog;
      if (args.purpose !== undefined) {
        const p = purposeArg(args);
        if (typeof p !== "string") return p;
        list = filterCatalogForPurpose(list, p);
      }
      if (typeof args.query === "string") list = filterCatalog(list, args.query);
      list = sortByPrice(list);
      const limit = typeof args.limit === "number" && args.limit > 0 ? Math.floor(args.limit) : 50;
      return { ok: true, total: list.length, returned: Math.min(limit, list.length), models: list.slice(0, limit).map(summarize) };
    },
  },
  {
    name: "ai_models_get_openrouter",
    description:
      "Get one OpenRouter model's details by exact id (e.g. `openai/gpt-4o-mini`): pricing per 1M " +
      "tokens, modalities, context window, and which purposes it is eligible for. Admin+.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string", description: "Exact OpenRouter model id." } },
      required: ["id"],
      additionalProperties: false,
    },
    run: async (args, ctx) => {
      if (!canCurateAiModels(ctx.user.role)) return forbidden();
      const id = typeof args.id === "string" ? args.id.trim() : "";
      if (!id) return { ok: false, error: "idRequired", message: "`id` is required." };
      const catalog = await loadCatalog();
      if (!Array.isArray(catalog)) return catalog;
      const model = catalog.find((m) => m.id === id);
      if (!model) {
        const near = filterCatalog(catalog, id.split("/").pop() ?? id).slice(0, 5).map((m) => m.id);
        return { ok: false, error: "notFound", message: `No curatable OpenRouter model "${id}".${near.length ? ` Similar: ${near.join(", ")}` : ""}` };
      }
      const eligiblePurposes = AI_PURPOSES.filter((p) => filterCatalogForPurpose([model], p).length > 0);
      return { ok: true, model: summarize(model), eligiblePurposes };
    },
  },
  {
    name: "ai_models_get_settings",
    description:
      "Read the AI-models settings: for every purpose the ordered curated alias list (first = default; " +
      "each alias has an immutable `key`, a `label`, the OpenRouter `model` id, `marginPct`) plus the " +
      "global monthly credit pool (USD, null = unset). Admin+.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    run: async (_args, ctx) => {
      if (!canCurateAiModels(ctx.user.role)) return forbidden();
      return { ok: true, purposes: await getCuratedPurposes(), poolUsd: await getCreditPoolUsd() };
    },
  },
  {
    name: "ai_models_add",
    description:
      "Add a curated model alias to a purpose. `model` = OpenRouter id (check it with " +
      "ai_models_get_openrouter first). `label` is the customer-facing name (defaults to the model " +
      "name); `key` (a-z0-9-, unique per purpose) is derived from the label when omitted and can " +
      "never change afterwards; `marginPct` defaults to 30; `position` (0-based) inserts — 0 makes it " +
      "the purpose's default, omitted appends. Admin+.",
    inputSchema: {
      type: "object",
      properties: {
        purpose: PURPOSE_SCHEMA,
        model: { type: "string", description: "OpenRouter model id, e.g. openai/gpt-4o-mini." },
        label: { type: "string" },
        key: { type: "string", description: "Optional explicit alias key [a-z0-9-]{1,40}." },
        marginPct: { type: "number", minimum: 0 },
        position: { type: "integer", minimum: 0 },
      },
      required: ["purpose", "model"],
      additionalProperties: false,
    },
    run: async (args, ctx) => {
      if (!canCurateAiModels(ctx.user.role)) return forbidden();
      const p = purposeArg(args);
      if (typeof p !== "string") return p;
      const current = await getCuratedPurposes();
      return persist(addCuratedModel(current, p, args), p);
    },
  },
  {
    name: "ai_models_update",
    description:
      "Update an existing curated alias (identified by purpose + immutable `key`): change its `label`, " +
      "`model` id, `marginPct`, and/or `position` (0-based; 0 = make it the default). Omitted fields " +
      "stay unchanged. Admin+.",
    inputSchema: {
      type: "object",
      properties: {
        purpose: PURPOSE_SCHEMA,
        key: { type: "string" },
        label: { type: "string" },
        model: { type: "string" },
        marginPct: { type: "number", minimum: 0 },
        position: { type: "integer", minimum: 0 },
      },
      required: ["purpose", "key"],
      additionalProperties: false,
    },
    run: async (args, ctx) => {
      if (!canCurateAiModels(ctx.user.role)) return forbidden();
      const p = purposeArg(args);
      if (typeof p !== "string") return p;
      const key = typeof args.key === "string" ? args.key.trim().toLowerCase() : "";
      if (!key) return { ok: false, error: "keyRequired", message: "`key` is required." };
      const current = await getCuratedPurposes();
      return persist(updateCuratedModel(current, p, key, args), p);
    },
  },
  {
    name: "ai_models_remove",
    description:
      "Remove a curated alias from a purpose by its `key`. Sites that selected this alias fall back " +
      "to the purpose's default (first remaining alias); removing the last alias leaves the purpose " +
      "empty. Admin+.",
    inputSchema: {
      type: "object",
      properties: { purpose: PURPOSE_SCHEMA, key: { type: "string" } },
      required: ["purpose", "key"],
      additionalProperties: false,
    },
    run: async (args, ctx) => {
      if (!canCurateAiModels(ctx.user.role)) return forbidden();
      const p = purposeArg(args);
      if (typeof p !== "string") return p;
      const key = typeof args.key === "string" ? args.key.trim().toLowerCase() : "";
      if (!key) return { ok: false, error: "keyRequired", message: "`key` is required." };
      const current = await getCuratedPurposes();
      const out = await persist(removeCuratedModel(current, p, key), p);
      if (out.ok && Array.isArray(out.models) && out.models.length === 0) {
        out.warning = `${p} now has no curated models.`;
      }
      return out;
    },
  },
];
