/**
 * Public robots.txt (seo-robots goal, track #3) — per-Site crawler rules.
 *
 * Served from D1: structured allow/disallow rows (per user-agent) plus a
 * free-text override served verbatim when set. Seeded default (allow all,
 * disallow /admin /api /preview) applies until the operator configures it. The
 * `Sitemap:` pointer resolves to `<origin>/sitemap.xml` via resolveSiteOrigin;
 * an unknown origin (local dev) omits the pointer rather than emit a wrong host.
 *
 * A route handler (not the `robots.ts` metadata convention) because the
 * free-text override needs verbatim text output, which the structured
 * MetadataRoute.Robots shape can't represent.
 *
 * MUST be dynamic — reads per-request D1, which build-time prerender can't
 * (same trap sitemap.ts + the indexnow-key route hit). `/robots.txt` is a
 * dotted-root file → already excluded by the worker edge-cache dot gate.
 */
import { getRobotsConfig } from "@/db/settings-store";
import { buildRobotsTxt } from "@/lib/render/robots-txt";
import { resolveSiteOrigin } from "@/lib/render/site-origin";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const [config, origin] = await Promise.all([
    getRobotsConfig(),
    resolveSiteOrigin(),
  ]);
  return new Response(buildRobotsTxt(config, origin), {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
