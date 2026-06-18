/**
 * CMS component export/import REST endpoint (Milestone 2, epic H1/H2).
 *
 *   GET                  → list components (name + has-script/css flags)
 *   GET  ?name=Foo       → EXPORT one component as a portable JSON bundle (H1)
 *   POST { bundle | … }  → IMPORT a portable bundle: validate (trust boundary)
 *                           → upsert by name (H2)
 *
 * IMPORT IS A TRUST BOUNDARY: the body may be a pasted/uploaded bundle from
 * another Site. The server RE-VALIDATES with `parsePortableComponent` (renderable
 * tree, allowed utility classes, bounded script, safe name, envelope/version) —
 * the client validation is a convenience only, never trusted.
 *
 * REST-only, no server actions (PM directive). Pure format logic in
 * `lib/components/portable.ts`; D1 in `db/component-store.ts`. Live D1 needs a
 * real binding (HITL).
 */
import {
  getComponentByName,
  listComponents,
  upsertImportedComponent,
} from "@/db/component-store";
import { parsePortableComponent, serializeComponent } from "@/lib/components/portable";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const name = new URL(request.url).searchParams.get("name");
  try {
    if (name) {
      const row = await getComponentByName(name);
      if (!row) return Response.json({ error: "component not found" }, { status: 404 });
      const bundle = serializeComponent(row, { exportedAt: new Date().toISOString() });
      return new Response(JSON.stringify(bundle, null, 2), {
        headers: {
          "Content-Type": "application/json",
          // Offer a sensible download filename when fetched directly.
          "Content-Disposition": `attachment; filename="${row.name}.component.json"`,
        },
      });
    }
    const rows = await listComponents();
    return Response.json(
      rows.map((r) => ({
        name: r.name,
        hasScript: (r.script ?? "") !== "",
        hasCss: (r.css ?? "") !== "",
      })),
    );
  } catch (err) {
    return Response.json(
      { error: (err as Error).message ?? "failed to read components" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid JSON body" }, { status: 400 });
  }

  // Accept either the bundle directly, or { bundle: … } / { text: "<json>" }.
  const raw =
    body && typeof body === "object" && "bundle" in (body as Record<string, unknown>)
      ? (body as Record<string, unknown>).bundle
      : body && typeof body === "object" && "text" in (body as Record<string, unknown>)
        ? (body as Record<string, unknown>).text
        : body;

  const parsed = parsePortableComponent(raw);
  if (!parsed.ok) {
    return Response.json({ error: parsed.errors.join("; ") }, { status: 400 });
  }

  try {
    const res = await upsertImportedComponent(parsed.component);
    return Response.json(res, { status: res.action === "created" ? 201 : 200 });
  } catch (err) {
    return Response.json(
      { error: (err as Error).message ?? "failed to import component" },
      { status: 500 },
    );
  }
}
