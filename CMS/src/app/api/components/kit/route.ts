/**
 * Premade-kit install endpoint (Milestone 2, epic G1).
 *
 *   GET            → the kit manifest (id + component names) so the UI can show
 *                    what "Install blog kit" will add. No D1 read.
 *   POST {id?}     → INSTALL the kit: run EVERY bundle through the SAME import
 *                    gate (`parsePortableComponent`) and the SAME write path
 *                    (`upsertImportedComponent`) the manual `/api/components`
 *                    import uses. No new validation or write path is introduced.
 *
 * The kit bundles are static, authored data (`lib/components/blog-kit.ts`), but
 * they are STILL re-validated here — they go through the trust boundary exactly
 * like a pasted/uploaded bundle. If we ever ship a malformed kit bundle, the
 * gate rejects it with the same errors a bad import would get (and a regression
 * test asserts every shipped bundle passes the gate offline).
 *
 * REST-only (no server actions). Live D1 write needs a real binding (HITL).
 */
import { missingComponentNames, upsertImportedComponent } from "@/db/component-store";
import { parsePortableComponent } from "@/lib/components/portable";
import { BLOG_KIT_ID, blogKit, blogKitNames } from "@/lib/components/blog-kit";

export const dynamic = "force-dynamic";

export function GET(): Response {
  // Only the blog kit exists today; the shape is a list so more kits can be
  // added without changing the contract.
  return Response.json({
    kits: [{ id: BLOG_KIT_ID, components: blogKitNames() }],
  });
}

export async function POST(request: Request): Promise<Response> {
  // Optional { id } selects a kit; default = the blog kit (the only one).
  let id = BLOG_KIT_ID;
  try {
    const body = (await request.json()) as unknown;
    if (body && typeof body === "object" && typeof (body as { id?: unknown }).id === "string") {
      id = (body as { id: string }).id;
    }
  } catch {
    /* empty/invalid body → default kit */
  }

  if (id !== BLOG_KIT_ID) {
    return Response.json({ error: `unknown kit "${id}"` }, { status: 404 });
  }

  // 1) Re-validate every bundle through the import trust boundary FIRST, so a
  //    single bad bundle fails the whole install before any partial write.
  const validated = [];
  const assetDeps = new Set<string>();
  const componentDeps = new Set<string>();
  for (const b of blogKit()) {
    const parsed = parsePortableComponent(b);
    if (!parsed.ok) {
      return Response.json(
        { error: `kit bundle "${b.component.name}" is invalid: ${parsed.errors.join("; ")}` },
        { status: 500 },
      );
    }
    for (const k of parsed.assets) assetDeps.add(k);
    for (const d of parsed.componentDeps) componentDeps.add(d);
    validated.push(parsed.component);
  }

  // 2) Upsert each via the SAME write path as a manual import.
  try {
    const results = [];
    for (const c of validated) {
      results.push(await upsertImportedComponent(c));
    }
    const created = results.filter((r) => r.action === "created").length;
    const updated = results.filter((r) => r.action === "updated").length;
    // Component deps the kit references but does NOT install itself (H3b), still
    // missing from this Site → warn (don't auto-install). Names the kit installs
    // are satisfied by this very install, so exclude them.
    const installedNames = new Set(validated.map((c) => c.name));
    const externalDeps = [...componentDeps].filter((n) => !installedNames.has(n));
    const missingComponents = await missingComponentNames(externalDeps);
    // Asset deps the kit references (H3) — empty for the blog kit, but surfaced
    // so a future media-bearing kit tells the user what to upload.
    return Response.json({
      id,
      installed: results,
      created,
      updated,
      assets: [...assetDeps],
      missingComponents,
    });
  } catch (err) {
    return Response.json(
      { error: (err as Error).message ?? "failed to install kit" },
      { status: 500 },
    );
  }
}
