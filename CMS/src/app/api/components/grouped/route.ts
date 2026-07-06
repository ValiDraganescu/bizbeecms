/**
 * Grouped component listing for the page-builder Components rail (page-builder epic).
 *
 *   GET → the Site's components GROUPED two ways: by their source kit (`groups`,
 *         plus a trailing "individually-imported" sourceKit=null group) AND by
 *         operator tags (`tagGroups`, a component appears under each of its tags
 *         + a trailing untagged group). The rail picks which grouping to render
 *         via its Kit/Tag toggle.
 *
 * Closes the kit↔component GAP: components are stored FLAT in D1 with an optional
 * `sourceKit` tag (set when a kit bundle is imported). This endpoint reads those
 * tags (`listComponentsWithKit`) and shapes them via the PURE
 * `groupComponentsByKit` helper (tested offline).
 *
 * REST-only (no server actions). Live D1 read needs a real binding (HITL).
 */
import { listComponentsWithKit } from "@/db/component-store";
import { groupComponentsByKit, groupComponentsByTag } from "@/lib/components/grouped";
import { requireAdmin } from "@/lib/auth/guard";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const denied = await requireAdmin(request);
  if (denied) return denied;
  try {
    const components = await listComponentsWithKit();
    // No fixed kit registry (starter kits removed) — groups come solely from
    // the sourceKit tags kit imports leave behind.
    const groups = groupComponentsByKit(components);
    const tagGroups = groupComponentsByTag(components);
    return Response.json({ groups, tagGroups });
  } catch (err) {
    return Response.json(
      { error: (err as Error).message ?? "failed to list components" },
      { status: 500 },
    );
  }
}
