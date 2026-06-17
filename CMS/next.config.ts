import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  // Cloudflare Workers (OpenNext) — see open-next.config.ts and wrangler.jsonc.
};

export default withNextIntl(nextConfig);

// Initialize the Cloudflare context during `next dev` so that
// getCloudflareContext() (D1, KV, env bindings) works locally.
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";
initOpenNextCloudflareForDev();
