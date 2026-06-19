import { WORKERS_DEV_SUFFIX } from "../config/hosts.ts";

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
 */
export async function cmsWorkerUrl(workerName: string): Promise<string | null> {
  if (!workerName) return null;
  return `https://${workerName}${WORKERS_DEV_SUFFIX}`;
}
