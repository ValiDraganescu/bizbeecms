/**
 * Curated model aliases for one purpose (ai-cost-quotas W2-E, Contract E).
 *
 *   GET /api/ai-config/aliases?purpose=<chatAgent|assistant|imageDescribe|
 *       imageGenerate|translate>  →  { aliases: [{ key, label, model }] }
 *
 * The pickers in the admin UI offer ONLY what the platform curated, so this is
 * the one place client components learn about aliases — they never parse the raw
 * config (which also carries margins + the site quota, neither of which belongs
 * in a browser). `marginPct` is deliberately not projected.
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

export const dynamic = "force-dynamic";

/** The wire shape — the customer-facing fields only, never `marginPct`. */
export interface AliasOption {
  key: string;
  label: string;
  model: string;
}

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
  const aliases: AliasOption[] = (config?.purposes[purpose]?.models ?? []).map((m) => ({
    key: m.key,
    label: m.label,
    model: m.model,
  }));
  return Response.json({ aliases });
}
