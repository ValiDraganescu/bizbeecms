import { cmsWorkerUrl } from "../deploy/worker-url.ts";
import { workerNameForSlug } from "../deploy/worker-name.ts";
import { OPENROUTER_KEYS_URL } from "../openrouter/provision.ts";
import {
  computeDrift,
  parseOpenRouterKeyUsageUsd,
  parseSiteAiUsage,
  type FleetSiteUsage,
} from "./usage.ts";

/**
 * The network edge of the fleet usage dashboard (Contract F). Every call goes
 * through an injected `fetch`, and all parsing/arithmetic lives in ./usage.ts —
 * this file is only "make the two requests, hand the bodies to the parsers,
 * never throw".
 *
 * Two upstreams per site, both optional:
 *  - the Site's own CMS Worker (`/api/pm/ai-usage`, Contract D) — the meter;
 *  - OpenRouter's Provisioning API for the minted key — the reconciliation
 *    source. A site with no minted key simply has no drift signal.
 *
 * A site that doesn't answer renders as `unreachable`; it never fails the page.
 */

type FetchLike = typeof fetch;

/** The per-site inputs the dashboard route pulls out of the `sites` table. */
export type FleetSite = {
  id: string;
  name: string;
  slug: string;
  /** Recorded on a successful deploy; absent → derived from the slug. */
  workerName: string | null;
  /** The minted key's OpenRouter hash; null → no reconciliation for this site. */
  openrouterKeyHash: string | null;
};

export type FleetPollOptions = {
  /** Account workers.dev subdomain (env `WORKERS_SUBDOMAIN`). */
  workersSubdomain: string;
  /** PM-wide `CMS_AUTH_SECRET` — the fleet's bearer for M2M calls. */
  cmsAuthSecret: string;
  /** PM's OpenRouter management key; blank → skip reconciliation entirely. */
  provisioningKey: string;
  fetchImpl?: FetchLike;
};

/** `https://bizbeecms-cms-<slug>.<subdomain>.workers.dev/api/pm/ai-usage`. */
export function siteUsageUrl(site: FleetSite, workersSubdomain: string): string | null {
  const origin = cmsWorkerUrl(site.workerName ?? workerNameForSlug(site.slug), workersSubdomain);
  return origin ? `${origin}/api/pm/ai-usage` : null;
}

/** Poll every site concurrently — one slow site must not serialize the fleet. */
export async function pollFleetUsage(
  sites: readonly FleetSite[],
  opts: FleetPollOptions,
): Promise<FleetSiteUsage[]> {
  return Promise.all(sites.map((site) => pollSiteUsage(site, opts)));
}

async function pollSiteUsage(
  site: FleetSite,
  opts: FleetPollOptions,
): Promise<FleetSiteUsage> {
  const identity = { siteId: site.id, name: site.name, slug: site.slug };

  // The site's meter and its OpenRouter spend are independent reads — issue both
  // at once so a site's row costs one round-trip's latency, not two.
  const [usage, openRouterUsageUsd] = await Promise.all([
    fetchSiteUsage(site, opts),
    fetchKeyUsageUsd(site.openrouterKeyHash, opts),
  ]);

  if (!usage) return { ...identity, state: "unreachable" };
  return {
    ...identity,
    state: "ok",
    usage,
    drift: computeDrift(usage.rawNanoUsd, openRouterUsageUsd),
  };
}

async function fetchSiteUsage(site: FleetSite, opts: FleetPollOptions) {
  const url = siteUsageUrl(site, opts.workersSubdomain);
  if (!url || !opts.cmsAuthSecret) return null;
  const body = await fetchJson(url, opts.cmsAuthSecret, opts.fetchImpl);
  return body === null ? null : parseSiteAiUsage(body);
}

async function fetchKeyUsageUsd(hash: string | null, opts: FleetPollOptions) {
  if (!hash || !opts.provisioningKey) return null;
  const body = await fetchJson(
    `${OPENROUTER_KEYS_URL}/${encodeURIComponent(hash)}`,
    opts.provisioningKey,
    opts.fetchImpl,
  );
  return body === null ? null : parseOpenRouterKeyUsageUsd(body);
}

/** GET + bearer + JSON. Any failure (network, non-2xx, bad JSON) → null. */
async function fetchJson(
  url: string,
  bearer: string,
  fetchImpl: FetchLike = fetch,
): Promise<unknown> {
  try {
    const res = await fetchImpl(url, {
      headers: { Authorization: `Bearer ${bearer}` },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}
