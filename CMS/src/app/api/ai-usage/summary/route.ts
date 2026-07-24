/**
 * The settings AI-usage page's ONE data call (ai-usage-settings-page).
 *
 *   GET /api/ai-usage/summary →
 *     {
 *       quotaUsd:   number | null,                      // null = no quota allocated
 *       month:      { month, billableUsd },             // month-to-date billable
 *       allTimeUsd: number | null,                      // null = section unreadable
 *       days:       [{ day, usd }] | null,              // last 30, oldest first
 *       purposes:   [{ purpose, usd }] | null,          // current month, catalog order
 *     }
 *
 * The hero numbers come from `checkAiQuota` — the exact read the enforcement
 * gate and the credit chip use, so the page can never disagree with what the
 * assistant does. `month.billableUsd` rounds to cents like the chip; the
 * daily / purpose / all-time figures keep 6 decimals (`usdFromNanoFine`)
 * because a single call is often sub-cent.
 *
 * Admin-only (CMS-internal). REST-only (PM directive). Never 500 — each
 * section degrades independently: an unreadable all-time or daily read
 * reports `null` for THAT section and the rest still renders (`checkAiQuota`
 * already fails open on its own).
 */
import { requireAdmin } from "@/lib/auth/guard";
import {
  checkAiQuota,
  readAllTimeBillableNanoUsd,
  readDailyAiUsage,
} from "@/db/ai-usage-store";
import { usdFromNanoFine } from "@/lib/ai-usage/summary";
import { aiUsageMonth, usdFromNano } from "@/lib/public-chat/core";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const denied = await requireAdmin(request);
  if (denied) return denied;

  const now = new Date();
  const [quota, allTimeNano, daily] = await Promise.all([
    checkAiQuota(now), // never rejects — fails open to { quotaUsd: null, used 0 }
    readAllTimeBillableNanoUsd().catch(() => null),
    readDailyAiUsage(now).catch(() => null),
  ]);

  return Response.json({
    quotaUsd: quota.quotaUsd,
    month: { month: aiUsageMonth(now), billableUsd: usdFromNano(quota.usedNanoUsd) },
    allTimeUsd: allTimeNano === null ? null : usdFromNanoFine(allTimeNano),
    days: daily && daily.days.map(({ day, nanoUsd }) => ({ day, usd: usdFromNanoFine(nanoUsd) })),
    purposes:
      daily &&
      daily.purposes.map(({ purpose, nanoUsd }) => ({ purpose, usd: usdFromNanoFine(nanoUsd) })),
  });
}
