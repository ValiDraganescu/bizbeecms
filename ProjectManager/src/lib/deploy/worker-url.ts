import { ACCOUNT_WORKERS_SUBDOMAIN } from "../config/hosts.ts";

/**
 * Public URL of a deployed CMS Worker.
 *
 * ponytail: Sites are served directly on their `bizbeecms-cms-<slug>.workers.dev`
 * URL — this is the PERMANENT scheme. A custom `<slug>.site.bizbeecms.com` scheme
 * was considered but ruled out (USER DECISION 2026-06-19): it needs a paid
 * Advanced Certificate Manager wildcard cert for `*.site.*` (the free universal
 * cert can't cover two levels, and a bare `*.bizbeecms.com` route shadows our
 * infra custom domains). Customer-owned custom domains still work via
 * /attach-domain + HOST_MAP + router.
 *
 * The account subdomain is injectable because PM's own service-to-service calls
 * to the fleet (the AI usage poll) read `WORKERS_SUBDOMAIN` from the Worker env
 * — the router and deployer already treat it as a var, so PM shouldn't be the
 * one place it's hard-coded. Blank → the compiled-in account default, so a
 * missing var degrades to today's URL instead of `https://name..workers.dev`.
 */
export function cmsWorkerUrl(
  workerName: string,
  subdomain: string = ACCOUNT_WORKERS_SUBDOMAIN,
): string | null {
  if (!workerName) return null;
  const sub = subdomain.trim() || ACCOUNT_WORKERS_SUBDOMAIN;
  return `https://${workerName}.${sub}.workers.dev`;
}
