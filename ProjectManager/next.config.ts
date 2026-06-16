import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Cloudflare Workers (OpenNext) — see open-next.config.ts and wrangler.jsonc.
};

export default nextConfig;

// Initialize the Cloudflare context during `next dev` so that
// getCloudflareContext() (D1, KV, env bindings) works locally.
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";
initOpenNextCloudflareForDev();
