import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/user";
import { circuitBreakerLimitUsd } from "@/lib/ai/usage";
import { getProvisioningKey, syncKeyCap } from "@/lib/openrouter/key-cap";
import { listAllSitesForFleet } from "@/lib/site/site";

/**
 * One-time backfill (Contract F, migration step 6): PATCH every already-minted
 * OpenRouter key to its Site's circuit-breaker cap + `limit_reset: "monthly"`.
 *
 * Keys minted before this feature carry the RAW quota as a lifetime limit — the
 * wrong number and the wrong semantics (no reset means the site bricks the month
 * after the cap is reached). Idempotent: PATCHing a key that's already correct
 * is a no-op upstream, so it's safe to re-run after fixing whatever failed.
 *
 * Admin+ only. Per-site outcomes come back individually — a partial failure is
 * the normal case (one revoked key upstream) and must not read as total failure.
 */
export type ApplyCapsResult = {
  siteId: string;
  name: string;
  /** The cap we set, in USD; null = the Site has no quota so the key is uncapped. */
  capUsd: number | null;
  /** Absent = applied; present = why it didn't. */
  error?: string;
};

export type ApplyCapsResponse = {
  results: ApplyCapsResult[];
  ok: number;
  failed: number;
};

export async function POST(): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user || (user.role !== "SuperAdmin" && user.role !== "Admin")) {
    return NextResponse.json({ error: "notAllowed" }, { status: 403 });
  }

  const provisioningKey = await getProvisioningKey();
  const sites = (await listAllSitesForFleet()).filter((s) => s.openrouterKeyHash);

  // Independent PATCHes against one upstream — run them together rather than
  // walking the fleet serially.
  const results = await Promise.all(
    sites.map(async (site): Promise<ApplyCapsResult> => {
      const error = await syncKeyCap(
        provisioningKey,
        site.openrouterKeyHash,
        site.openrouterMonthlyLimitUsd,
      );
      return {
        siteId: site.id,
        name: site.name,
        capUsd: circuitBreakerLimitUsd(site.openrouterMonthlyLimitUsd),
        ...(error ? { error } : {}),
      };
    }),
  );

  const body: ApplyCapsResponse = {
    results,
    ok: results.filter((r) => !r.error).length,
    failed: results.filter((r) => r.error).length,
  };
  return NextResponse.json(body);
}
