/**
 * Icon-set setting (icon-sets epic).
 *
 *   GET   → { set, default, options } — the selected Iconify prefix (resolved),
 *           the default ("lucide"), and the curated shortlist for the picker.
 *   PATCH → store `{ set }` (validated as a syntactic Iconify prefix; an invalid
 *           value falls back to the default — never 400 on the untrusted id, per
 *           the model-setting discipline).
 *
 * Admin/Manager only. REST-only (PM directive). Components resolve `{{icon "x"}}`
 * slots against whatever set is stored here. Mirrors the translate-model route.
 */
import { requireUserManager } from "@/lib/auth/guard";
import { DEFAULT_ICON_SET, ICON_SET_OPTIONS, isValidIconSet } from "@/lib/render/icons";
import { PAGES_CACHE_TAG } from "@/lib/render/edge-cache";
import { purgeEdgeTags } from "@/lib/render/purge-edge";
import { getIconSet, setIconSet } from "@/db/settings-store";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const denied = await requireUserManager(request);
  if (denied) return denied;
  try {
    return Response.json({
      set: await getIconSet(),
      default: DEFAULT_ICON_SET,
      options: ICON_SET_OPTIONS,
    });
  } catch (err) {
    return Response.json(
      { error: (err as Error).message ?? "failed to read icon set" },
      { status: 500 },
    );
  }
}

export async function PATCH(request: Request): Promise<Response> {
  const denied = await requireUserManager(request);
  if (denied) return denied;
  let body: { set?: unknown };
  try {
    body = (await request.json()) as { set?: unknown };
  } catch {
    return Response.json({ error: "expected JSON { set }" }, { status: 400 });
  }
  try {
    // Accept any syntactically-valid Iconify prefix (the shortlist is just the
    // friendly picker; power users can target other sets). Invalid → default.
    const raw = typeof body.set === "string" ? body.set.trim() : "";
    const resolved = isValidIconSet(raw) ? raw : DEFAULT_ICON_SET;
    await setIconSet(resolved);
    // The icon set resolves every `{{icon "x"}}` slot in published-page HTML
    // (render-page.tsx getIconSet) — a global-blast write. Purge the shared
    // pages tag so cached pages re-render with the new set. Best-effort.
    await purgeEdgeTags(PAGES_CACHE_TAG);
    return Response.json({ set: resolved });
  } catch (err) {
    return Response.json(
      { error: (err as Error).message ?? "failed to save icon set" },
      { status: 500 },
    );
  }
}
