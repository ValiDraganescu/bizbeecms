/**
 * Curated model aliases for one purpose (ai-cost-quotas W2-E, Contract E).
 *
 *   GET /api/ai-config/aliases?purpose=<chatAgent|assistant|imageDescribe|
 *       imageGenerate|translate>
 *   → { aliases: [{ key, label, model, inputPrice, outputPrice,
 *                   inputModalities, outputModalities, contextLength }] }
 *
 * The pickers in the admin UI offer ONLY what the platform curated, so this is
 * the one place client components learn about aliases — they never parse the raw
 * config. Each alias is JOINED against the cached OpenRouter catalog (same
 * loader as `/api/chat/models`, so the cache stays warm on curated sites too)
 * to carry modality metadata and CUSTOMER-facing prices: the raw per-token rate
 * already adjusted by the alias margin. `marginPct` itself is deliberately not
 * projected — adjusted prices are what the operator pays and may see.
 *
 * An empty list means "no curated config" (fresh site, PM unreachable, local dev
 * without PM). Clients treat that as "fall back to the free catalog picker", so
 * a config-less CMS stays fully usable — the same rule the server-side call
 * paths follow via `effectiveModel`.
 *
 * Admin-gated + REST-only (PM directive: no server actions).
 */
import { requireAdmin } from "@/lib/auth/guard";
import { getAiConfig, AI_PURPOSES, type AiPurpose } from "@/lib/ai-config";
import { projectAliasOptions } from "@/lib/ai-config/alias-options";
import { loadModelCatalog } from "@/lib/chat/catalog-loader";
import type { CatalogModel } from "@/lib/chat/models";

export const dynamic = "force-dynamic";

function parsePurpose(value: string | null): AiPurpose | null {
  return AI_PURPOSES.find((p) => p === value) ?? null;
}

export async function GET(request: Request): Promise<Response> {
  const denied = await requireAdmin(request);
  if (denied) return denied;

  const purpose = parsePurpose(new URL(request.url).searchParams.get("purpose"));
  if (!purpose) {
    return Response.json(
      { error: `expected ?purpose= one of: ${AI_PURPOSES.join(", ")}` },
      { status: 400 },
    );
  }

  // Config unavailable → an empty list, never an error: the picker falls back.
  const config = await getAiConfig();
  const curated = config?.purposes[purpose]?.models ?? [];

  // Price/modality join is a progressive enhancement — a catalog failure must
  // never hide the curated aliases themselves.
  let catalog: ReadonlyArray<CatalogModel> = [];
  if (curated.length > 0) {
    try {
      catalog = (await loadModelCatalog()).models;
    } catch {
      catalog = [];
    }
  }

  return Response.json({ aliases: projectAliasOptions(curated, catalog) });
}
