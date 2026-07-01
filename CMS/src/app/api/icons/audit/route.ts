/**
 * Icon audit for a set switch (icon-sets epic, phase 3).
 *
 *   GET /api/icons/audit?set=tabler
 *     → { ok, set, missing: [{ name, components[] }] }
 *
 * Reports which icon names referenced by components don't exist in `set` (default
 * the currently-selected set), so the operator can see what a switch would break
 * before/after changing it. Advisory; covers literal `{{icon "x"}}` references in
 * component trees (dynamic page-prop icon names are not scanned). Admin-only.
 */
import { requireAdmin } from "@/lib/auth/guard";
import { getIconSet } from "@/db/settings-store";
import { auditMissingIcons } from "@/db/icon-store";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const denied = await requireAdmin(request);
  if (denied) return denied;

  try {
    const url = new URL(request.url);
    const set = (url.searchParams.get("set") ?? "").trim() || (await getIconSet());
    const result = await auditMissingIcons(set);
    return Response.json(result);
  } catch (err) {
    return Response.json(
      { error: (err as Error).message ?? "icon audit failed" },
      { status: 500 },
    );
  }
}
