import { WORKERS_DEV_SUFFIX } from "@/lib/config/hosts";

/**
 * Best-effort public URL of a deployed CMS Worker.
 *
 * A Site's CMS deploys as its own Worker on our Cloudflare account, served at
 * `https://<workerName><.account-subdomain.workers.dev>`. The account subdomain
 * is a fixed constant for our account (`hosts.ts` → WORKERS_DEV_SUFFIX), so we
 * build the URL from that — independent of `APP_ORIGIN`, which is now a custom
 * domain (`manager.bizbeecms.com`) and can no longer be parsed for the subdomain.
 *
 * ponytail: still returns the workers.dev URL; the `<slug>.site.bizbeecms.com`
 * custom-hostname scheme is a separate backlog task — switch this then.
 */
export async function cmsWorkerUrl(workerName: string): Promise<string | null> {
  if (!workerName) return null;
  return `https://${workerName}${WORKERS_DEV_SUFFIX}`;
}
