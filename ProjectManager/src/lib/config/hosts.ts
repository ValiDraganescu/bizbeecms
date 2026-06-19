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
 * (the router derives the slug from the leftmost subdomain label). A dedicated
 * `.site.*` namespace, NOT bare `<slug>.bizbeecms.com`: a one-level wildcard
 * route shadows our own infra custom domains (manager/deployer). Cost: the free
 * universal cert covers only `*.bizbeecms.com`, so `*.site.bizbeecms.com` needs
 * an Advanced Certificate Manager cert on the zone. Single source of truth so no
 * `.workers.dev` strings leak into user-facing links.
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

/** CF anycast IPs for apex domains that can't CNAME — used as A records. */
export const CUSTOM_DOMAIN_APEX_IPS = ["104.21.34.242", "172.67.210.25"];

/**
 * The DNS records a customer adds to point `hostname` at us. Deterministic from
 * the hostname (NOT the volatile cert-validation TXT, which CF issues per attach):
 * a subdomain CNAMEs to the fallback origin; an apex (exactly two labels, e.g.
 * `example.com`) can't CNAME, so it uses A records to CF's anycast IPs. Always
 * shown so the operator can re-check setup any time, not just right after attach.
 */
export function routingRecordsForHost(hostname: string): {
  isApex: boolean;
  cname: { name: string; value: string };
  apexA: { name: string; values: string[] };
} {
  const isApex = hostname.split(".").length === 2;
  return {
    isApex,
    cname: { name: hostname, value: CUSTOM_DOMAIN_FALLBACK_ORIGIN },
    apexA: { name: hostname, values: CUSTOM_DOMAIN_APEX_IPS },
  };
}
