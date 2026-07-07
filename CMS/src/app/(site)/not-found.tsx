/**
 * Branded 404 for published Sites (seo-robots — designated 404 page).
 *
 * The catch-all's miss path (`[[...slug]]/page.tsx`) calls `notFound()`, which
 * renders THIS component with an HTTP 404 status. If the operator designated a
 * published page as the site's 404 page (site setting `not_found_page`), we
 * render that page's real plan; otherwise a plain built-in 404.
 *
 * URL-locale rendering: Next's `not-found.tsx` receives no params/pathname, so
 * the worker injects the incoming pathname as the `REQUEST_PATH_HEADER` request
 * header (release-gated) and we peel the content locale from it — `/fi/missing`
 * renders the 404 in fi. Reading a request header here is safe DESPITE the
 * (site) cache-poisoning guard because a 404 is NEVER edge-cached (the worker
 * gate is GET-200-only), so this response never enters the cache. When the
 * header is absent (pre-release worker, or a non-worker path) we degrade to the
 * site default content locale — same behavior as before.
 *
 * `robots noindex` is emitted so a soft-404's branded body is never indexed.
 */
import type { Metadata } from "next";
import { headers } from "next/headers";
import { getNotFoundPageId } from "@/db/settings-store";
import { loadPlanById, peelActiveLocaleFromPath } from "@/lib/render/load-plan";
import { REQUEST_PATH_HEADER } from "@/lib/render/edge-cache";
import { RenderedPage } from "@/lib/render/render-page";
import en from "../../../messages/en.json";

// A 404 must never be indexed (a branded body can read as real content).
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function SiteNotFound() {
  const pageId = await getNotFoundPageId();
  if (pageId) {
    // Peel the content locale from the worker-injected request path so the 404
    // renders in the visitor's URL locale; falls back to the site default when
    // the header is absent (pre-release worker) — peelActiveLocaleFromPath("").
    const requestPath = (await headers()).get(REQUEST_PATH_HEADER);
    const locale = await peelActiveLocaleFromPath(requestPath);
    // Only renders when the designated page is still PUBLISHED (loadPlanById
    // returns null for a missing/unpublished/deleted target) — graceful
    // degradation to the plain 404 below.
    const loaded = await loadPlanById(pageId, locale);
    if (loaded) return <RenderedPage plan={loaded.plan} />;
  }
  // Fallback: plain built-in 404 (unset, or the designated page is gone).
  return (
    <main
      style={{
        minHeight: "60vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: "0.5rem",
        textAlign: "center",
        padding: "2rem",
      }}
    >
      <h1 style={{ fontSize: "2rem", fontWeight: 700 }}>404</h1>
      <p style={{ opacity: 0.7 }}>{en.app.description}</p>
    </main>
  );
}
