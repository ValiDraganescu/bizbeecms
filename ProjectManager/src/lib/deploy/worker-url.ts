import { getCloudflareContext } from "@opennextjs/cloudflare";

/**
 * Best-effort public URL of a deployed CMS Worker.
 *
 * A Site's CMS deploys as its own Worker on the same Cloudflare account, served
 * at `https://<workerName>.<account-subdomain>.workers.dev`. We don't store the
 * account subdomain separately — but the PM itself runs on that same subdomain,
 * so we derive it from `APP_ORIGIN` (e.g.
 * `https://bizbeecms-projectmanager.<sub>.workers.dev` → `<sub>`) and swap in the
 * Worker name. Returns null when APP_ORIGIN is unset or isn't a workers.dev host
 * (e.g. a custom domain), since the URL can't be derived then.
 */
export async function cmsWorkerUrl(workerName: string): Promise<string | null> {
  const { env } = await getCloudflareContext({ async: true });
  // APP_ORIGIN is a wrangler var, not in the generated CloudflareEnv types.
  const bag = env as unknown as Record<string, unknown>;
  const origin = typeof bag.APP_ORIGIN === "string" ? bag.APP_ORIGIN : "";
  if (!origin) return null;

  let host: string;
  try {
    host = new URL(origin).host; // e.g. bizbeecms-projectmanager.acme.workers.dev
  } catch {
    return null;
  }

  // Expect `<pm-name>.<account-subdomain>.workers.dev`; replace the leading
  // label with the CMS worker name. Only works for workers.dev hosts.
  if (!host.endsWith(".workers.dev")) return null;
  const rest = host.slice(host.indexOf(".") + 1); // <account-subdomain>.workers.dev
  return `https://${workerName}.${rest}`;
}
