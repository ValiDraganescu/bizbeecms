/**
 * Admin draft-preview route (page-builder Preview slice).
 *
 * The public route (`[[...slug]]/page.tsx`) renders a page ONLY when it's
 * `published`, so the builder's Preview iframe of a draft would be blank. This
 * route renders ANY page (any publish status) by id, using the EXACT SAME
 * render pipeline (`buildPlanFromPage` + `RenderedPage`) — true-to-site preview
 * means reusing the real renderer, never forking a second one.
 *
 * Gated by `checkAdminFromHeaders` (the same guard as the rest of /admin and
 * /api): an unauthorized request 404s, so drafts never leak publicly.
 */
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { page as pageTable } from "@/db/schema";
import { checkAdminFromHeaders } from "@/lib/auth/guard";
import { buildPlanFromPage, RenderedPage } from "@/lib/render/render-page";

export const dynamic = "force-dynamic";

type RouteParams = { id: string };

/**
 * The builder's preview chrome can force a color mode via `?theme=dark|light`
 * so the operator can SEE dark mode without changing their OS. We wrap the
 * rendered page in a `data-theme` div: globals.css's `[data-theme="dark"]`
 * token block + the per-Site dark overrides (both keyed off `[data-theme]`)
 * cascade onto it. No param → inherit the root layout's `data-theme="system"`
 * (follows OS), so default behavior is unchanged.
 */
function themeAttr(raw: string | string[] | undefined): "dark" | "light" | undefined {
  const v = Array.isArray(raw) ? raw[0] : raw;
  return v === "dark" || v === "light" ? v : undefined;
}

export default async function PreviewPage({
  params,
  searchParams,
}: {
  params: Promise<RouteParams>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // Fail-closed: only an authorized admin may preview a draft.
  const decision = await checkAdminFromHeaders();
  if (!decision.allow) notFound();

  const { id } = await params;
  const theme = themeAttr((await searchParams).theme);
  const db = await getDb();
  const rows = await db
    .select()
    .from(pageTable)
    .where(eq(pageTable.id, id))
    .limit(1);
  const pageRow = rows[0];
  if (!pageRow) notFound();

  const { plan } = await buildPlanFromPage(pageRow);
  const rendered = <RenderedPage plan={plan} />;
  // `data-theme` on a wrapper re-scopes the token cascade for the forced mode.
  return theme ? <div data-theme={theme}>{rendered}</div> : rendered;
}
