/**
 * Export-by-tag → ONE kit bundle (component-kits Slice 3).
 *
 *   GET ?tag=<tag>  → a single `*.kit.json` (`format:"bizbeecms.kit"`) built from
 *                     every component carrying <tag>. Reuses the EXISTING
 *                     per-component portable serialization + its asset/component
 *                     dep collection (so nested deps come along), unioned/deduped
 *                     across the kit by the pure `buildKitBundle` helper.
 *
 * Read-only export (no trust boundary — output, not input). Admin-gated.
 * REST-only, no server actions (PM directive). Pure format logic in
 * `lib/components/portable.ts`; D1 in `db/component-store.ts`.
 */
import { listComponents } from "@/db/component-store";
import { buildKitBundle } from "@/lib/components/portable";
import { filterByTag } from "@/lib/components/tags";
import { requireAdmin } from "@/lib/auth/guard";

export const dynamic = "force-dynamic";

// A safe, filesystem-friendly slug for the download filename (the tag is operator
// free-text). Falls back to "kit" if the tag has no usable characters.
function fileSlug(tag: string): string {
  const s = tag.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return s || "kit";
}

export async function GET(request: Request): Promise<Response> {
  const denied = await requireAdmin(request);
  if (denied) return denied;
  const params = new URL(request.url).searchParams;
  const tag = (params.get("tag") ?? "").trim();
  if (!tag) return Response.json({ error: "tag is required" }, { status: 400 });
  // Optional operator metadata: a custom kit name + description (bounded). Falls
  // back to the tag for the name and no note (component-kits: kit metadata).
  const name = (params.get("name") ?? "").trim().slice(0, 120);
  const note = (params.get("note") ?? "").trim().slice(0, 2000);
  try {
    const rows = await listComponents();
    const tagged = filterByTag(rows, tag);
    if (tagged.length === 0) {
      return Response.json({ error: `no components tagged "${tag}"` }, { status: 404 });
    }
    const bundle = buildKitBundle(tagged, tag, {
      exportedAt: new Date().toISOString(),
      ...(name ? { name } : {}),
      ...(note ? { note } : {}),
    });
    return new Response(JSON.stringify(bundle, null, 2), {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="${fileSlug(name || tag)}.kit.json"`,
      },
    });
  } catch (err) {
    return Response.json(
      { error: (err as Error).message ?? "failed to export kit" },
      { status: 500 },
    );
  }
}
