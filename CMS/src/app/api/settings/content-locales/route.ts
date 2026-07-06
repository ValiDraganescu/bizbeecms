/**
 * CMS content-locale settings REST endpoint (Milestone 2, epic C1b).
 *
 * GET  → the per-Site content-locale config `{ default, locales[] }`.
 * PUT  → upsert it (normalized server-side via `normalizeContentLocales`).
 *
 * The CONTENT locales are the data-driven, per-Site user-facing language set
 * (distinct from the fixed EN/FI/ET admin-UI locale set). Pure config logic
 * lives in `lib/render/localize.ts`; D1 read/write in `db/settings-store.ts`.
 *
 * REST-only, no server actions (PM directive — server actions 500 on
 * OpenNext/Workers). Live D1 needs a real binding (HITL); only the offline
 * normalize/validate path is exercisable here.
 */
import { getContentLocales, setContentLocales } from "@/db/settings-store";
import { listPages } from "@/db/page-store";
import { localeSlugConflicts, normalizeContentLocales } from "@/lib/render/localize";
import { requireAdmin } from "@/lib/auth/guard";
import { PAGES_CACHE_TAG } from "@/lib/render/edge-cache";
import { purgeEdgeTags } from "@/lib/render/purge-edge";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const denied = await requireAdmin(request);
  if (denied) return denied;
  try {
    return Response.json(await getContentLocales());
  } catch (err) {
    return Response.json(
      { error: (err as Error).message ?? "failed to load content locales" },
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
    return Response.json({ error: "invalid JSON body" }, { status: 400 });
  }

  // normalizeContentLocales is defensive (garbage → safe default), but reject an
  // empty result so a typo can't silently wipe the set to just "en".
  const normalized = normalizeContentLocales(body);
  if (normalized.locales.length === 0) {
    return Response.json({ error: "no valid locales" }, { status: 400 });
  }

  try {
    // A locale code equal to an existing top-level page slug would shadow that
    // page behind the /<code>/ locale URL prefix (Stage 1 locale-prefix routing).
    const topLevelSlugs = (await listPages())
      .filter((p) => p.parentPageId === null)
      .map((p) => p.slug);
    const conflicts = localeSlugConflicts(normalized.locales, topLevelSlugs);
    if (conflicts.length > 0) {
      return Response.json(
        {
          error: `locale code(s) ${conflicts.join(", ")} collide with existing top-level page slug(s) — rename those pages first`,
          code: "localeIsPageSlug",
          conflicts,
        },
        { status: 409 },
      );
    }
    const saved = await setContentLocales(normalized);
    // Locale set changes every page's hreflang alternates + LanguageSwitcher —
    // blast the shared pages tag. Best-effort.
    await purgeEdgeTags(PAGES_CACHE_TAG);
    return Response.json(saved);
  } catch (err) {
    return Response.json(
      { error: (err as Error).message ?? "failed to save content locales" },
      { status: 500 },
    );
  }
}
