/**
 * Branded 404 for published Sites (seo-robots — designated 404 page).
 *
 * The catch-all's miss path (`[[...slug]]/page.tsx`) calls `notFound()`, which
 * renders THIS component with an HTTP 404 status. If the operator designated a
 * published page as the site's 404 page (site setting `not_found_page`), we
 * render that page's real plan; otherwise a plain built-in 404.
 *
 * WHY the DEFAULT content locale, not the request URL locale: Next's
 * `not-found.tsx` receives no params/pathname, and this (site) group
 * deliberately reads no request/visitor-varying data (cache-poisoning guard —
 * see the layout). A 404 is never edge-cached anyway (the worker gate is
 * GET-200-only), but rendering in the site default keeps this dependency-free
 * of request headers. Per-URL-locale 404 would need the worker to inject the
 * path (a release-gated change) — filed as a follow-up.
 *
 * `robots noindex` is emitted so a soft-404's branded body is never indexed.
 */
import type { Metadata } from "next";
import { getContentLocales, getNotFoundPageId } from "@/db/settings-store";
import { loadPlanById } from "@/lib/render/load-plan";
import { RenderedPage } from "@/lib/render/render-page";
import en from "../../../messages/en.json";

// A 404 must never be indexed (a branded body can read as real content).
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function SiteNotFound() {
  const pageId = await getNotFoundPageId();
  if (pageId) {
    const { default: defaultLocale } = await getContentLocales();
    // Only renders when the designated page is still PUBLISHED (loadPlanById
    // returns null for a missing/unpublished/deleted target) — graceful
    // degradation to the plain 404 below.
    const loaded = await loadPlanById(pageId, defaultLocale);
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
