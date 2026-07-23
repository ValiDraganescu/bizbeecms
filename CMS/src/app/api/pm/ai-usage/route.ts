/**
 * This Site's AI spend, for PM's fleet dashboards (ai-cost-quotas, Contract D;
 * polled by Contract F).
 *
 *   GET /api/pm/ai-usage → { month, billableNanoUsd, rawNanoUsd, quotaUsd }
 *
 * The reverse of the config call: PM curates the config INTO the CMS, the CMS
 * reports what it spent back OUT. Both directions are gated by the same PM-wide
 * `CMS_AUTH_SECRET` bearer (site identity is the Worker itself — PM knows which
 * Site it dialled). Not admin-gated: no CMS session exists on a machine call.
 *
 * `billableNanoUsd` is what the customer is billed and what the quota gate
 * refuses on; `rawNanoUsd` is the provider's own cost, which PM reconciles
 * against OpenRouter's per-key usage. `quotaUsd` is null when this Worker has no
 * curated config yet — PM should read that as "unknown", not "unlimited".
 *
 * REST-only, force-dynamic (every read is a live counter).
 */
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getAiConfig } from "@/lib/ai-config";
import { readMonthlyAiUsage } from "@/db/ai-usage-store";

export const dynamic = "force-dynamic";

/** Constant-ish bearer check against the Worker's PM-wide shared secret. */
async function authorized(request: Request): Promise<boolean> {
  try {
    const { env } = await getCloudflareContext({ async: true });
    const secret = (env as unknown as Record<string, unknown>).CMS_AUTH_SECRET;
    const presented = (request.headers.get("authorization") ?? "").replace(
      /^Bearer\s+/i,
      "",
    );
    return typeof secret === "string" && secret !== "" && presented === secret;
  } catch {
    // No CF context (local dev without bindings) → no secret to match, deny.
    return false;
  }
}

export async function GET(request: Request): Promise<Response> {
  if (!(await authorized(request))) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    // Independent reads — the config fetch must not delay the counter read.
    const [usage, config] = await Promise.all([readMonthlyAiUsage(), getAiConfig()]);
    return Response.json({
      month: usage.month,
      billableNanoUsd: usage.billableNanoUsd,
      rawNanoUsd: usage.rawNanoUsd,
      quotaUsd: config?.quota.monthlyUsd ?? null,
    });
  } catch (err) {
    return Response.json(
      { error: (err as Error).message ?? "failed to read AI usage" },
      { status: 500 },
    );
  }
}
