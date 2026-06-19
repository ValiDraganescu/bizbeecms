/**
 * Grouped component listing for the page-builder Components rail (page-builder epic).
 *
 *   GET → the Site's components GROUPED by their source kit, plus a trailing
 *         "individually-imported" group (sourceKit = null). One group per known
 *         kit (in registry order) even if it has 0 installed components, so the
 *         rail can show every kit; a stale-tagged kit id still surfaces.
 *
 * Closes the kit↔component GAP: components are stored FLAT in D1 with an optional
 * `sourceKit` tag (set at kit-install time). This endpoint reads those tags
 * (`listComponentsWithKit`) and shapes them via the PURE `groupComponentsByKit`
 * helper (tested offline). No second component pipeline — the kit registry here
 * is the SAME id set the install endpoint uses.
 *
 * REST-only (no server actions). Live D1 read needs a real binding (HITL).
 */
import { listComponentsWithKit } from "@/db/component-store";
import { groupComponentsByKit } from "@/lib/components/grouped";
import { BLOG_KIT_ID } from "@/lib/components/blog-kit";
import { LANDING_KIT_ID } from "@/lib/components/landing-kit";
import { DOCS_KIT_ID } from "@/lib/components/docs-kit";
import { requireAdmin } from "@/lib/auth/guard";

export const dynamic = "force-dynamic";

// Known kit ids, in display order — the SAME registry the install endpoint uses.
const KIT_ORDER = [BLOG_KIT_ID, LANDING_KIT_ID, DOCS_KIT_ID];

export async function GET(request: Request): Promise<Response> {
  const denied = await requireAdmin(request);
  if (denied) return denied;
  try {
    const components = await listComponentsWithKit();
    const groups = groupComponentsByKit(components, KIT_ORDER);
    return Response.json({ groups });
  } catch (err) {
    return Response.json(
      { error: (err as Error).message ?? "failed to list components" },
      { status: 500 },
    );
  }
}
