/**
 * CMS per-Site LOGO settings REST endpoint (theme page).
 *
 * GET → `{ url }` — the stored logo's `/media/<key>` URL ("" when unset).
 * PUT `{ url }` → validate (site media URLs only, "" clears) + upsert.
 *
 * Pure validation lives in `lib/settings/site-logo.ts`; D1 read/write in
 * `db/settings-store.ts`. The logo may render on published pages (components
 * read it via get_theme), so a change blasts the shared pages cache tag —
 * mirroring the color/fonts routes. REST-only, no server actions (PM
 * directive).
 */
import { getSiteLogo, setSiteLogo } from "@/db/settings-store";
import { normalizeSiteLogoUrl, SITE_LOGO_URL_ERROR } from "@/lib/settings/site-logo";
import { requireAdmin } from "@/lib/auth/guard";
import { PAGES_CACHE_TAG } from "@/lib/render/edge-cache";
import { purgeEdgeTags } from "@/lib/render/purge-edge";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const denied = await requireAdmin(request);
  if (denied) return denied;
  try {
    return Response.json({ url: await getSiteLogo() });
  } catch (err) {
    return Response.json(
      { error: (err as Error).message ?? "failed to load logo" },
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

  const raw =
    body && typeof body === "object" && !Array.isArray(body)
      ? (body as { url?: unknown }).url
      : undefined;
  const normalized = normalizeSiteLogoUrl(raw);
  if (normalized === null) {
    return Response.json({ error: SITE_LOGO_URL_ERROR }, { status: 400 });
  }

  try {
    const saved = await setSiteLogo(normalized);
    // The logo may appear on any published page — blast the shared tag. Best-effort.
    await purgeEdgeTags(PAGES_CACHE_TAG);
    return Response.json({ url: saved });
  } catch (err) {
    return Response.json(
      { error: (err as Error).message ?? "failed to save logo" },
      { status: 500 },
    );
  }
}
