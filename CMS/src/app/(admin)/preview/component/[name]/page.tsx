/**
 * Standalone component-preview route (admin Develop page).
 *
 * Renders ONE component in isolation using the REAL renderer
 * (`buildPlanFromComponent` → `RenderedPage`) — same pipeline as the page
 * preview, so the preview is pixel-true. The component has no page block to feed
 * its `{{slots}}`, so the placeholder data (each declared prop's `default` from
 * its `propsSchema`) is bound in instead. The Develop page embeds this as an
 * iframe so the component's CSS + client script stay isolated from the admin chrome.
 *
 * Gated by `checkAdminFromHeaders` (same guard as the rest of /admin and /api):
 * an unauthorized request 404s.
 */
import { notFound } from "next/navigation";
import { checkAdminFromHeaders } from "@/lib/auth/guard";
import { buildPlanFromComponent, RenderedPage } from "@/lib/render/render-page";

export const dynamic = "force-dynamic";

type RouteParams = { name: string };

function themeAttr(raw: string | string[] | undefined): "dark" | "light" | undefined {
  const v = Array.isArray(raw) ? raw[0] : raw;
  return v === "dark" || v === "light" ? v : undefined;
}

export default async function ComponentPreviewPage({
  params,
  searchParams,
}: {
  params: Promise<RouteParams>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const decision = await checkAdminFromHeaders();
  if (!decision.allow) notFound();

  const { name } = await params;
  const sp = await searchParams;
  const theme = themeAttr(sp.theme);

  const built = await buildPlanFromComponent(decodeURIComponent(name));
  if (!built) notFound();

  const rendered = <RenderedPage plan={built.plan} />;

  // `data-theme` re-scopes the token cascade for a forced mode; paint the wrapper
  // (same reasoning as the page-preview route) so a forced-dark preview isn't white.
  return theme ? (
    <div
      data-theme={theme}
      style={{ backgroundColor: "var(--color-surface)", minHeight: "100vh" }}
    >
      {rendered}
    </div>
  ) : (
    rendered
  );
}
