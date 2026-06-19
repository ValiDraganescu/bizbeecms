/**
 * Single source of truth for the host / domain constants the app checks against.
 * Centralized so changing the Cloudflare account subdomain, the zone, or the
 * fallback origin is a one-file edit — and so every place that trusts a host can
 * be found here.
 *
 * NOTE: the router (`router/wrangler.jsonc`) and deployer pass the equivalent
 * values as Worker vars (WORKERS_SUBDOMAIN) — those stay env-driven. This file is
 * for PM-side code that needs the values at build/runtime without a binding.
 */

/** Our Cloudflare account's workers.dev subdomain. */
export const ACCOUNT_WORKERS_SUBDOMAIN = "vali-draganescu88";

/** Full suffix every Worker on our account shares: `.<sub>.workers.dev`. */
export const WORKERS_DEV_SUFFIX = `.${ACCOUNT_WORKERS_SUBDOMAIN}.workers.dev`;

/** Per-Site CMS Workers are named `bizbeecms-cms-<slug>`. */
export const CMS_WORKER_PREFIX = "bizbeecms-cms-";

/** Our real registrable zone (NOT on the Public Suffix List). */
export const ZONE_DOMAIN = "bizbeecms.com";

/**
 * Per-Site CMS public hostname suffix: a Site deployed as worker
 * `bizbeecms-cms-<slug>` is served at `https://<slug>.site.bizbeecms.com`
 * (the router derives the slug from the leftmost subdomain label). Single
 * source of truth so no `.workers.dev` strings leak into user-facing links.
 */
export const SITE_HOST_SUFFIX = `.site.${ZONE_DOMAIN}`;

/** Public CMS URL for a Site slug: `https://<slug>.site.bizbeecms.com`. */
export function siteUrlForSlug(slug: string): string {
  return `https://${slug}${SITE_HOST_SUFFIX}`;
}

/** PM's stable custom domain. PM-internal links and injected PM_ORIGIN use it. */
export const PM_ORIGIN = `https://manager.${ZONE_DOMAIN}`;

/**
 * Fallback origin for Cloudflare-for-SaaS custom hostnames — the CNAME target
 * customer domains point at, served by the router Worker. (Mirrors the deployer's
 * /attach-domain CNAME value and the router's route.)
 */
export const CUSTOM_DOMAIN_FALLBACK_ORIGIN = "cf.bizbeecms.com";
