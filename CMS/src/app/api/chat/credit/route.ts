/**
 * The chat widget's credit chip — this Site's monthly AI budget (ai-cost-quotas,
 * Contract D).
 *
 *   GET /api/chat/credit → { credit: { usedUsd, quotaUsd, remainingUsd } | null }
 *
 * Reads LOCAL counters only: the `ai:<YYYY-MM>:billable` meter vs the quota PM
 * curates for this Site. Those are the numbers the operator is actually billed
 * for and the numbers the enforcement gate refuses on, so the chip can never
 * disagree with what the assistant does. (It previously reported OpenRouter's
 * per-KEY spend — the provider's raw cost on a key whose limit is now just a
 * circuit breaker, not the customer's quota.)
 *
 * `{ credit: null }` when no quota is configured (or the config is unreachable):
 * there is nothing to count against, so the chip hides rather than showing a
 * meaningless "used $X of $?".
 *
 * Admin-only (CMS-internal). REST-only (PM directive). Never 500 — a read
 * failure degrades to `{ credit: null }` and the widget simply omits the chip.
 */
import { requireAdmin } from "@/lib/auth/guard";
import { checkAiQuota } from "@/db/ai-usage-store";
import { usdFromNano } from "@/lib/public-chat/core";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const denied = await requireAdmin(request);
  if (denied) return denied;

  try {
    const { usedNanoUsd, quotaUsd } = await checkAiQuota();
    if (quotaUsd === null) return Response.json({ credit: null });

    const usedUsd = usdFromNano(usedNanoUsd);
    return Response.json({
      credit: {
        usedUsd,
        quotaUsd,
        // Never negative: an overshooting in-flight turn reads as "$0 left",
        // not as a debt.
        remainingUsd: Math.max(0, Math.round((quotaUsd - usedUsd) * 100) / 100),
      },
    });
  } catch {
    // Never break the widget — degrade to no credit info.
    return Response.json({ credit: null });
  }
}
