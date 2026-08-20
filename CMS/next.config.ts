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
// connect (scripts/connect.mjs): when a `.prod-remote.json` marker is
// present, boot against the generated `wrangler.prod-remote.jsonc` (remote
// bindings -> PRODUCTION D1/KV/R2) instead of the committed local config.
import { existsSync, readFileSync } from "node:fs";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";
const prodRemoteMarker = `${process.cwd()}/.prod-remote.json`;
const localSiteMarker = `${process.cwd()}/.local-site.json`;
if (existsSync(prodRemoteMarker)) {
  const m = JSON.parse(readFileSync(prodRemoteMarker, "utf8"));
  console.warn(
    `\n⚠  PROD-REMOTE MODE${m.slug ? ` (site ${m.slug})` : ""}: local dev is bound to PRODUCTION Cloudflare resources.` +
      `\n   Run scripts/connect.mjs local to restore.\n`,
  );
  initOpenNextCloudflareForDev({ configPath: `${process.cwd()}/${m.config}`, environment: m.env });
} else if (existsSync(localSiteMarker)) {
  // connect (scripts/connect.mjs cms <slug>): per-Site Miniflare state dir so
  // several local test Sites keep separate D1/R2. SITE_ID itself comes from
  // .dev.vars (the script patches it in step with this marker).
  const m = JSON.parse(readFileSync(localSiteMarker, "utf8"));
  console.log(`· local-site: ${m.slug} (${m.persist})`);
  initOpenNextCloudflareForDev({ persist: { path: m.persist } });
} else {
  initOpenNextCloudflareForDev();
}
