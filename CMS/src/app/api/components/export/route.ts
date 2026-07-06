/**
 * Export → ONE kit bundle (component-kits Slice 3 + components-gallery).
 *
 *   GET ?tag=<tag>      → a single kit (`format:"bizbeecms.kit"`) built from
 *                         every component carrying <tag>.
 *   GET ?names=<a,b,c>  → same kit envelope built from an explicit selection
 *                         (the gallery's "export selected"; one name = kit of 1).
 *                         Any missing name 404s — never a silently partial export.
 *
 * Both reuse the EXISTING per-component portable serialization + its
 * asset/component dep collection (so nested deps come along), unioned/deduped
 * across the kit by the pure `buildKitBundle` helper.
 *
 * Read-only export (no trust boundary — output, not input). Admin-gated.
 * REST-only, no server actions (PM directive). Pure format logic in
 * `lib/components/portable.ts` + `lib/components/kit-zip.ts`; D1 in
 * `db/component-store.ts`.
 */
import { listComponents } from "@/db/component-store";
import { buildKitBundle } from "@/lib/components/portable";
import { defaultKitName, parseNamesParam, selectByNames } from "@/lib/components/kit-zip";
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
  const names = parseNamesParam(params.get("names") ?? "");
  if (!tag && names.length === 0) {
    return Response.json({ error: "tag or names is required" }, { status: 400 });
  }
  // Optional operator metadata: a custom kit name + description (bounded). Falls
  // back to the tag / selection default for the name (component-kits: kit metadata).
  const name = (params.get("name") ?? "").trim().slice(0, 120);
  const note = (params.get("note") ?? "").trim().slice(0, 2000);
  try {
    const rows = await listComponents();
    let picked: typeof rows;
    if (names.length > 0) {
      const { selected, missing } = selectByNames(rows, names);
      if (missing.length > 0) {
        return Response.json(
          { error: `no such component(s): ${missing.join(", ")}` },
          { status: 404 },
        );
      }
      picked = selected;
    } else {
      picked = filterByTag(rows, tag);
      if (picked.length === 0) {
        return Response.json({ error: `no components tagged "${tag}"` }, { status: 404 });
      }
    }
    // A names export has no producing tag → tag stays "", and the kit name
    // falls back to the selection default (the component itself for a kit of 1).
    const kitName = name || (names.length > 0 ? defaultKitName(names) : "");
    const bundle = buildKitBundle(picked, tag, {
      exportedAt: new Date().toISOString(),
      ...(kitName ? { name: kitName } : {}),
      ...(note ? { note } : {}),
    });
    return new Response(JSON.stringify(bundle, null, 2), {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="${fileSlug(kitName || tag)}.kit.json"`,
      },
    });
  } catch (err) {
    return Response.json(
      { error: (err as Error).message ?? "failed to export kit" },
      { status: 500 },
    );
  }
}
