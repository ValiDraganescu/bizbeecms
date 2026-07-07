import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
import { version as cmsVersion } from "./package.json";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  // Cloudflare Workers (OpenNext) — see open-next.config.ts and wrangler.jsonc.
  // Expose the CMS release version to the client so the sidebar can show it.
  env: { NEXT_PUBLIC_CMS_VERSION: cmsVersion },
  // NOTE: no `headers()` rule for /preview/component here — the deployed
  // OpenNext worker ignores `has` matchers, which stamped the gallery's
  // year-long immutable Cache-Control on EVERY preview (stale Develop iframe
  // on deployed Sites). worker.ts stamps it instead, via
  // componentPreviewCacheControl (edge-cache.ts).
};

export default withNextIntl(nextConfig);

// Initialize the Cloudflare context during `next dev` so that
// getCloudflareContext() (D1, KV, env bindings) works locally.
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";
initOpenNextCloudflareForDev();
