import { WORKERS_DEV_SUFFIX } from "../config/hosts.ts";

/**
 * Public URL of a deployed CMS Worker.
 *
 * ponytail: Sites are served directly on their `bizbeecms-cms-<slug>.workers.dev`
 * URL. The custom `<slug>.site.bizbeecms.com` scheme (siteUrlForSlug in hosts.ts)
 * stays dormant until the zone gets an Advanced Certificate Manager cert for
 * `*.site.bizbeecms.com` — a bare `*.bizbeecms.com` route shadows our infra
 * custom domains, and the free universal cert can't cover two levels. Customer-
 * owned custom domains still work today via /attach-domain + HOST_MAP + router.
 * Switch this back to siteUrlForSlug(slug) once ACM is enabled.
 */
export async function cmsWorkerUrl(workerName: string): Promise<string | null> {
  if (!workerName) return null;
  return `https://${workerName}${WORKERS_DEV_SUFFIX}`;
}
