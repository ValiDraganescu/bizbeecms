/**
 * Icon search for the inspector icon PICKER (icon-sets epic).
 *
 *   GET /api/icons/search?q=calendar[&limit=48]
 *     → { set, icons: [{ name, svg }] }
 *
 * Searches the Site's SELECTED icon set (Settings) for names matching `q`, then
 * resolves each match's normalized inline SVG (cached) so the picker can render
 * the real glyph. Admin-only. REST-only (PM directive). The same engine the
 * `search_icons` MCP tool uses, plus the SVG payload the visual picker needs.
 */
import { requireAdmin } from "@/lib/auth/guard";
import { getIconSet } from "@/db/settings-store";
import { searchIcons, resolveIcons } from "@/db/icon-store";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const denied = await requireAdmin(request);
  if (denied) return denied;

  const url = new URL(request.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  const limitRaw = Number(url.searchParams.get("limit"));
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(96, limitRaw) : 48;

  try {
    const set = await getIconSet();
    if (q === "") return Response.json({ set, icons: [] });
    const names = await searchIcons(set, q, limit);
    const svgByName = await resolveIcons(set, names);
    // Preserve search-rank order; include only the ones that resolved to SVG.
    const icons = names
      .map((name) => ({ name, svg: svgByName.get(name) ?? "" }))
      .filter((i) => i.svg !== "");
    return Response.json({ set, icons });
  } catch (err) {
    return Response.json(
      { error: (err as Error).message ?? "icon search failed" },
      { status: 500 },
    );
  }
}
