import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getCurrentUser } from "@/lib/auth/user";
import { getCreditPoolUsd } from "@/lib/ai/settings";
import { pollFleetUsage, type FleetSite } from "@/lib/ai/fleet";
import { summarizeFleet, type FleetSiteUsage, type FleetTotals } from "@/lib/ai/usage";
import { getProvisioningKey } from "@/lib/openrouter/key-cap";
import { listAllSitesForFleet } from "@/lib/site/site";

/**
 * Fleet AI usage — Contract F. Admin+ only: it aggregates spend across every
 * Site, which is operator data, not customer data.
 *
 * `GET` polls each deployed Site's own CMS (`/api/pm/ai-usage`, Contract D) and,
 * for Sites with a minted key, OpenRouter's Provisioning API for the key's real
 * spend. All of it concurrently; a Site that doesn't answer comes back as
 * `unreachable` and the rest of the fleet still renders.
 *
 * On demand only (page load) — no cron. The fleet is small and this is an
 * operator page, so freshness beats a scheduled job and a stale cache.
 */
export type FleetUsageResponse = {
  sites: FleetSiteUsage[];
  totals: FleetTotals;
  /** The configured monthly credit pool in USD; null = unset. */
  poolUsd: number | null;
};

async function isAdmin(): Promise<boolean> {
  const user = await getCurrentUser();
  return user != null && (user.role === "SuperAdmin" || user.role === "Admin");
}

export async function GET(): Promise<NextResponse> {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "notAllowed" }, { status: 403 });
  }

  const { env } = await getCloudflareContext({ async: true });
  const bag = env as unknown as Record<string, unknown>;

  const [sites, poolUsd, provisioningKey] = await Promise.all([
    listAllSitesForFleet(),
    getCreditPoolUsd(),
    getProvisioningKey(),
  ]);

  const fleetSites: FleetSite[] = sites.map((s) => ({
    id: s.id,
    name: s.name,
    slug: s.slug,
    workerName: s.workerName,
    openrouterKeyHash: s.openrouterKeyHash,
  }));

  const rows = await pollFleetUsage(fleetSites, {
    workersSubdomain: typeof bag.WORKERS_SUBDOMAIN === "string" ? bag.WORKERS_SUBDOMAIN : "",
    cmsAuthSecret: typeof bag.CMS_AUTH_SECRET === "string" ? bag.CMS_AUTH_SECRET : "",
    provisioningKey,
  });

  const body: FleetUsageResponse = {
    sites: rows,
    totals: summarizeFleet(rows, poolUsd),
    poolUsd,
  };
  return NextResponse.json(body);
}
