/**
 * CMS branded-404 settings REST endpoint (seo-robots goal).
 *
 * GET → `{ pageId, options }` — the current designated 404 page id ("" = none)
 *       plus the list of PUBLISHED pages the operator can choose from
 *       (`{ id, label }`, label = default-locale meta title or slug).
 * PUT → set the designated 404 page id. Accepts "" (clear → plain 404) or the
 *       id of a currently-published page; a non-published / unknown id is a HARD
 *       reject (stable code `notPublished`) so the operator can't point the 404
 *       at a draft/deleted page. The render path (not-found.tsx) re-checks
 *       published at serve time too, so a later unpublish degrades gracefully.
 *
 * REST-only, no server actions (PM directive — server actions 500 on
 * OpenNext/Workers).
 */
import { getNotFoundPageId, setNotFoundPageId } from "@/db/settings-store";
import { listPages } from "@/db/page-store";
import { requireAdmin } from "@/lib/auth/guard";
import { notFoundPageOptions } from "@/lib/render/not-found-page";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const denied = await requireAdmin(request);
  if (denied) return denied;
  try {
    const [pageId, pages] = await Promise.all([getNotFoundPageId(), listPages()]);
    return Response.json({ pageId, options: notFoundPageOptions(pages) });
  } catch (err) {
    return Response.json(
      { error: (err as Error).message ?? "failed to load 404 page setting" },
      { status: 500 },
    );
  }
}

export async function PUT(request: Request): Promise<Response> {
  const denied = await requireAdmin(request);
  if (denied) return denied;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid JSON body", code: "badJson" }, { status: 400 });
  }
  const pageId = typeof (body as { pageId?: unknown })?.pageId === "string"
    ? (body as { pageId: string }).pageId.trim()
    : "";
  try {
    if (pageId) {
      const published = new Set((await listPages()).filter(isPublished).map((p) => p.id));
      if (!published.has(pageId)) {
        return Response.json(
          { error: "page is not published", code: "notPublished" },
          { status: 400 },
        );
      }
    }
    await setNotFoundPageId(pageId);
    return Response.json({ pageId });
  } catch (err) {
    return Response.json(
      { error: (err as Error).message ?? "failed to save 404 page setting" },
      { status: 500 },
    );
  }
}

function isPublished(p: { publishStatus: string }): boolean {
  return p.publishStatus === "published";
}
