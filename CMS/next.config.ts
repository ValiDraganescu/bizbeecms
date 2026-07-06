import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
import { version as cmsVersion } from "./package.json";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  // Cloudflare Workers (OpenNext) — see open-next.config.ts and wrangler.jsonc.
  // Expose the CMS release version to the client so the sidebar can show it.
  env: { NEXT_PUBLIC_CMS_VERSION: cmsVersion },
  async headers() {
    return [
      {
        // Component previews requested WITH a `?v=<updatedAt>` version are
        // immutable in the browser cache: the gallery busts by changing `v`
        // whenever a component row is saved (any mutation bumps updatedAt).
        // `private` — admin-gated content, browser cache only. Version-less
        // preview URLs (Develop workbench) keep Next's no-cache default.
        source: "/preview/component/:name",
        has: [{ type: "query", key: "v" }],
        headers: [
          { key: "Cache-Control", value: "private, max-age=31536000, immutable" },
        ],
      },
    ];
  },
};

export default withNextIntl(nextConfig);

// Initialize the Cloudflare context during `next dev` so that
// getCloudflareContext() (D1, KV, env bindings) works locally.
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";
initOpenNextCloudflareForDev();
