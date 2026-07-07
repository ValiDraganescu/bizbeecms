/**
 * CMS page-management REST endpoint (Milestone 2, epic C2) — the NON-AI
 * counterpart to the `create_page` AI tool. Authors page METADATA only (slug,
 * parent, publish status, per-locale SEO); the block tree is owned by the AI's
 * create_page / the future visual editor (C3), so it's left untouched on update.
 *
 *   GET                 → list all pages (parent slug resolved)
 *   POST  { …meta }     → create a page (empty block tree)
 *   PUT   { id, …meta } → update a page's metadata (blocks preserved)
 *   DELETE ?id=…        → delete a page (refused if it has children)
 *
 * REST-only, no server actions (PM directive — server actions 500 on
 * OpenNext/Workers). Pure validation in `lib/pages/page-meta.ts`; D1 in
 * `db/page-store.ts`. Live D1 needs a real binding (HITL).
 */
import { deletePage, getPageById, getPathRows, listPages, upsertPageMeta } from "@/db/page-store";
import { applyRenameRedirects } from "@/db/redirect-store";
import { validatePageMeta } from "@/lib/pages/page-meta";
import { getContentLocales } from "@/db/settings-store";
import { localeSlugConflicts } from "@/lib/render/localize";
import { redirectsForRename } from "@/lib/render/redirects";
import { descendantIds, type PathPageRow } from "@/lib/render/localize-paths";
import { noindexTurnedOn, pageUrlsAllLocales } from "@/lib/render/indexnow";
import { resolveSiteOrigin } from "@/lib/render/site-origin";
import { requireAdmin } from "@/lib/auth/guard";
import { PAGES_CACHE_TAG, pageCacheTag } from "@/lib/render/edge-cache";
import { purgeEdgeTags } from "@/lib/render/purge-edge";
import {
  collectPageUrls,
  notifyIndexNowForPage,
  notifyIndexNowUrls,
} from "@/lib/render/indexnow-notify";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const denied = await requireAdmin(request);
  if (denied) return denied;
  try {
    return Response.json(await listPages());
  } catch (err) {
    return Response.json(
      { error: (err as Error).message ?? "failed to list pages" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request): Promise<Response> {
  const denied = await requireAdmin(request);
  if (denied) return denied;
  return write(request, null);
}

export async function PUT(request: Request): Promise<Response> {
  const denied = await requireAdmin(request);
  if (denied) return denied;
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: "invalid JSON body" }, { status: 400 });
  }
  const id = typeof body.id === "string" ? body.id : "";
  if (!id) return Response.json({ error: "id is required for update" }, { status: 400 });
  return persist(body, id);
}

export async function DELETE(request: Request): Promise<Response> {
  const denied = await requireAdmin(request);
  if (denied) return denied;
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return Response.json({ error: "id query param is required" }, { status: 400 });
  try {
    // Capture the page's URLs BEFORE deleting — the row (and its path chain) is
    // gone afterwards. Best-effort; [] on any problem.
    const urls = await collectPageUrls(id);
    const res = await deletePage(id);
    if (!res.ok) return Response.json({ error: res.errors.join("; ") }, { status: 409 });
    // A deleted page must stop serving from the edge cache. Best-effort.
    await purgeEdgeTags(pageCacheTag(id));
    // Tell IndexNow the URLs are gone (best-effort, non-blocking).
    notifyIndexNowUrls(urls);
    return Response.json({ ok: true });
  } catch (err) {
    return Response.json(
      { error: (err as Error).message ?? "failed to delete page" },
      { status: 500 },
    );
  }
}

async function write(request: Request, id: string | null): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid JSON body" }, { status: 400 });
  }
  return persist(body, id);
}

async function persist(body: unknown, id: string | null): Promise<Response> {
  const v = validatePageMeta(body);
  if (!v.ok) return Response.json({ error: v.errors.join("; ") }, { status: 400 });
  try {
    // A top-level slug equal to a configured content-locale code would collide
    // with the /<code>/ locale URL prefix (Stage 1 locale-prefix routing).
    // Localized slug overrides get the same guard (CAVEATS: Stage 2).
    if (v.meta.parentSlug === null) {
      const { locales } = await getContentLocales();
      const candidates = [v.meta.slug, ...Object.values(v.meta.localizedSlugs ?? {})];
      const clash = localeSlugConflicts(locales, candidates);
      if (clash.length > 0) {
        return Response.json(
          {
            error: `slug "${clash[0]}" is a configured content-locale code — the /${clash[0]}/ locale prefix would shadow this page; pick a different slug`,
            code: "slugIsLocaleCode",
          },
          { status: 409 },
        );
      }
    }
    // Snapshot the page tree BEFORE the write so a rename can diff old→new
    // URLs and auto-capture 301 redirects. Only needed on an UPDATE (creates
    // can't move anything). Best-effort — an empty snapshot just skips capture.
    let oldRows: PathPageRow[] = [];
    // Capture noindex + URLs BEFORE the write to detect a false→true transition:
    // once the page is noindexed, collectPageUrls returns [] (it's crawler-
    // hidden), so the URLs to re-submit must be grabbed while still indexable.
    let oldNoindex = false;
    let preUrls: string[] = [];
    if (id !== null) {
      try {
        oldRows = (await getPathRows()) as PathPageRow[];
      } catch {
        oldRows = [];
      }
      try {
        const [before, urls] = await Promise.all([getPageById(id), collectPageUrls(id)]);
        oldNoindex = before?.noindex ?? false;
        preUrls = urls;
      } catch {
        // Best-effort — a failed pre-read just skips the noindex-transition ping.
      }
    }
    const res = await upsertPageMeta(v.meta, id);
    if (!res.ok) return Response.json({ error: res.errors.join("; ") }, { status: 409 });
    // Meta updates (incl. the publish/UNPUBLISH toggle, slug + SEO changes)
    // change what the published URL serves — bust this page's edge-cache
    // entries. A PATH change (slug/parent/localized overrides) additionally
    // blasts the shared `pages` tag: other cached pages embed reverse-resolved
    // links to this page and would serve now-404 hrefs until expiry.
    // Creates (id === null) can't be cached yet. Best-effort.
    if (id !== null) {
      await purgeEdgeTags(
        ...(res.pathChanged ? [PAGES_CACHE_TAG, pageCacheTag(id)] : [pageCacheTag(id)]),
      );
      // A PATH change (slug/parent/localized-slug rename) moved this page and its
      // whole subtree's URLs — auto-capture 301 redirects old→new so inbound
      // links (and search rankings) survive the rename, and re-notify IndexNow
      // with the OLD URLs (notifyIndexNowForPage below only submits the new ones,
      // so crawlers would keep hitting 404s until they recrawled). Best-effort:
      // any failure here must never fail the page save.
      if (res.pathChanged && oldRows.length > 0) {
        try {
          const [newRows, { default: defaultLocale, locales: codes }, origin] =
            await Promise.all([
              getPathRows() as Promise<PathPageRow[]>,
              getContentLocales(),
              resolveSiteOrigin(),
            ]);
          const affected = descendantIds(oldRows, id);
          const pairs = redirectsForRename(oldRows, newRows, affected, defaultLocale, codes);
          if (pairs.length > 0) {
            await applyRenameRedirects(pairs);
            // Re-notify IndexNow with the OLD absolute URLs (now redirecting).
            if (origin) {
              const oldUrls = affected.flatMap((pid) =>
                pageUrlsAllLocales(origin, oldRows, pid, defaultLocale, codes),
              );
              notifyIndexNowUrls(oldUrls);
            }
          }
        } catch {
          // Auto-capture is best-effort; the page save already succeeded.
        }
      }
      // Content/URL of an existing page changed (publish toggle, slug/SEO edit) —
      // tell IndexNow to recrawl its (possibly new) URLs. Best-effort, non-blocking.
      // (When noindex just turned ON, notifyIndexNowForPage is a no-op here:
      // collectPageUrls now returns [] for the noindexed page — hence the
      // pre-captured preUrls below.)
      await notifyIndexNowForPage(id);
      // noindex OFF→ON is the one content-visibility change that otherwise never
      // pings IndexNow: re-submit the URLs captured while still indexable so
      // engines recrawl and pick up the robots noindex. Best-effort, non-blocking.
      if (noindexTurnedOn(oldNoindex, v.meta.noindex) && preUrls.length > 0) {
        notifyIndexNowUrls(preUrls);
      }
    }
    return Response.json(res, { status: id === null ? 201 : 200 });
  } catch (err) {
    return Response.json(
      { error: (err as Error).message ?? "failed to save page" },
      { status: 500 },
    );
  }
}
