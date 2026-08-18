import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  // Cloudflare Workers (OpenNext) — see open-next.config.ts and wrangler.jsonc.
};

export default withNextIntl(nextConfig);

// Initialize the Cloudflare context during `next dev` so that
// getCloudflareContext() (D1, KV, env bindings) works locally.
// prod-connect (scripts/prod-connect.mjs): when a `.prod-remote.json` marker is
// present, boot against the generated `wrangler.prod-remote.jsonc` (remote
// bindings -> PRODUCTION D1/KV/R2) instead of the committed local config.
import { existsSync, readFileSync } from "node:fs";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";
const prodRemoteMarker = `${process.cwd()}/.prod-remote.json`;
if (existsSync(prodRemoteMarker)) {
  const m = JSON.parse(readFileSync(prodRemoteMarker, "utf8"));
  console.warn(
    `\n⚠  PROD-REMOTE MODE${m.slug ? ` (site ${m.slug})` : ""}: local dev is bound to PRODUCTION Cloudflare resources.` +
      `\n   Run scripts/prod-connect.mjs local to restore.\n`,
  );
  initOpenNextCloudflareForDev({ configPath: `${process.cwd()}/${m.config}`, environment: m.env });
} else {
  initOpenNextCloudflareForDev();
}
