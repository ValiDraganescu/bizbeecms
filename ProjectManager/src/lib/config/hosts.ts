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
 * Fallback origin for Cloudflare-for-SaaS custom hostnames — the CNAME target
 * customer domains point at, served by the router Worker. (Mirrors the deployer's
 * /attach-domain CNAME value and the router's route.)
 */
export const CUSTOM_DOMAIN_FALLBACK_ORIGIN = "cf.bizbeecms.com";
