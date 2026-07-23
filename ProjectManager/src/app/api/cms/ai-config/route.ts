import { NextResponse } from "next/server";
import { hasValidCmsSecret } from "@/lib/auth/cms-secret";
import { AI_CONFIG_VERSION, type AiConfigBody } from "@/lib/ai/curated";
import { getCuratedPurposes } from "@/lib/ai/settings";
import { findSiteById } from "@/lib/site/site";

/**
 * Curated AI config for one Site — Contract A of docs/ai-cost-quotas-contracts.md.
 * Called server-to-server by a deployed CMS Worker (never a browser), gated by
 * the shared `CMS_AUTH_SECRET` bearer like the other PM↔CMS service routes.
 *
 * `GET /api/cms/ai-config?siteId=<SITE_ID>` → the curated catalog (all five
 * purposes always present, entry order = preference, first entry = default) plus
 * that Site's monthly quota in customer USD (`null` = no quota configured).
 *
 * The CMS caches this in its own D1 with a TTL, so curation changes propagate
 * without redeploys and a PM outage degrades to stale-serving, not an outage.
 */
export async function GET(request: Request): Promise<NextResponse> {
  if (!(await hasValidCmsSecret(request))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const siteId = new URL(request.url).searchParams.get("siteId") ?? "";
  const site = siteId ? await findSiteById(siteId) : null;
  if (!site) {
    return NextResponse.json({ error: "notFound" }, { status: 404 });
  }

  const body: AiConfigBody = {
    version: AI_CONFIG_VERSION,
    purposes: await getCuratedPurposes(),
    quota: { monthlyUsd: site.openrouterMonthlyLimitUsd },
  };
  return NextResponse.json(body);
}
