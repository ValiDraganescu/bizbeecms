import { CMS_WORKER_PREFIX, siteUrlForSlug } from "@/lib/config/hosts";

/**
 * Public URL of a deployed CMS Worker.
 *
 * A Site's CMS deploys as worker `bizbeecms-cms-<slug>` and is served at the
 * stable custom hostname `https://<slug>.site.bizbeecms.com` (the router derives
 * the slug from the leftmost subdomain label). We strip the worker-name prefix
 * to recover the slug and build the URL from `hosts.ts` — no `.workers.dev`
 * string leaks into user-facing "Open CMS" / "open site" links.
 */
export async function cmsWorkerUrl(workerName: string): Promise<string | null> {
  if (!workerName) return null;
  if (!workerName.startsWith(CMS_WORKER_PREFIX)) return null;
  const slug = workerName.slice(CMS_WORKER_PREFIX.length);
  if (!slug) return null;
  return siteUrlForSlug(slug);
}
