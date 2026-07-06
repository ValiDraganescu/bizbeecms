/**
 * The site's public origin, for absolute SEO URLs (canonical/hreflang/sitemap).
 *
 * Prefer the deployer-injected `APP_ORIGIN` Worker var — the site's CONFIGURED
 * public origin (its custom domain when one is attached, else the workers.dev
 * URL). The request host is NOT a safe primary source: the router proxies
 * custom domains to the internal workers.dev origin, so on a proxied request
 * `host` is workers.dev (see admin/layout.tsx). Only fall back to the request
 * host in local dev where APP_ORIGIN is unset; return null when nothing is
 * known (callers then omit absolute URLs rather than emit wrong ones).
 */
import { headers } from "next/headers";
import { getCloudflareContext } from "@opennextjs/cloudflare";

export async function resolveSiteOrigin(): Promise<string | null> {
  const { env } = await getCloudflareContext({ async: true });
  const configured = ((env as { APP_ORIGIN?: string }).APP_ORIGIN ?? "")
    .trim()
    .replace(/\/+$/, "");
  if (configured) return configured;
  try {
    const h = await headers();
    const host = h.get("x-forwarded-host") ?? h.get("host");
    if (host) return `${h.get("x-forwarded-proto") ?? "https"}://${host}`;
  } catch {
    // headers() unavailable (e.g. build-time metadata route) — origin unknown.
  }
  return null;
}
