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
  deleteComponent,
  getComponentByName,
  listComponents,
  missingComponentNames,
  updateComponentTags,
  upsertImportedComponent,
} from "@/db/component-store";
import {
  KIT_FORMAT,
  parseKitBundle,
  parsePortableComponent,
  serializeComponent,
} from "@/lib/components/portable";
import { normalizeTags, parseTags } from "@/lib/components/tags";
import { requireAdmin } from "@/lib/auth/guard";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const denied = await requireAdmin(request);
  if (denied) return denied;
  const url = new URL(request.url);
  const name = url.searchParams.get("name");
  // draft=1: return the pending DRAFT artifact (Develop workbench edits the
  // draft; without it the post-save refetch reseeds from live and clobbers).
  const preferDraft = url.searchParams.get("draft") === "1";
  try {
    if (name) {
      const row = await getComponentByName(name, preferDraft);
      if (!row) return Response.json({ error: "component not found" }, { status: 404 });
      const bundle = serializeComponent(row, { exportedAt: new Date().toISOString() });
      return new Response(JSON.stringify(bundle, null, 2), {
        headers: {
          "Content-Type": "application/json",
          // Offer a sensible download filename when fetched directly.
          "Content-Disposition": `attachment; filename="${row.name}.component.json"`,
          // Kind is UI-only and deliberately NOT in the portable bundle (like
          // `label`), but the Develop editor needs to know a loaded component's
          // kind to pick the HTML vs JSON-LD workbench. Ship it out-of-band in a
          // header so the JSON download stays a clean portable bundle.
          "X-Component-Kind": row.kind ?? "html",
        },
      });
    }
    const rows = await listComponents();
    return Response.json(
      rows.map((r) => ({
        name: r.name,
        hasScript: (r.script ?? "") !== "",
        hasCss: (r.css ?? "") !== "",
        // Has declared props → the standalone preview has placeholder data to bind.
        hasPreviewData: (r.propsSchema ?? "") !== "",
        // r.tags is the raw JSON-string column — parseTags, never normalizeTags
        // (which only accepts arrays and turns a string into []).
        tags: parseTags(r.tags),
        label: r.label ?? null,
        // Cache-bust token for the gallery's preview iframes: every component
        // mutation bumps updatedAt, so `?v=` changes and the browser refetches.
        version: r.updatedAt?.getTime() ?? 0,
      })),
    );
  } catch (err) {
    return Response.json(
      { error: (err as Error).message ?? "failed to read components" },
      { status: 500 },
    );
  }
}

/**
 * PATCH { name, tags } → tags-only update of one component (component-kits Slice 2).
 * Sets ONLY the `tags` column (never the artifact). Tags are re-normalized
 * server-side (trim/dedupe/cap) so the stored value is canonical regardless of UI.
 */
export async function PATCH(request: Request): Promise<Response> {
  const denied = await requireAdmin(request);
  if (denied) return denied;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid JSON body" }, { status: 400 });
  }
  const obj = body && typeof body === "object" ? (body as Record<string, unknown>) : null;
  const name = obj && typeof obj.name === "string" ? obj.name.trim() : "";
  if (!name) return Response.json({ error: "name is required" }, { status: 400 });
  const tags = normalizeTags(obj?.tags);
  try {
    const res = await updateComponentTags(name, tags);
    if (!res.updated) return Response.json({ error: "component not found" }, { status: 404 });
    return Response.json({ name: res.name, tags });
  } catch (err) {
    return Response.json(
      { error: (err as Error).message ?? "failed to update tags" },
      { status: 500 },
    );
  }
}

/**
 * DELETE ?name=Foo → remove one component (admin Develop page). 404 if no such
 * component. A page block that still references it renders a visible placeholder
 * (planPage's unknown-component path), so a dangling reference is self-announcing.
 */
export async function DELETE(request: Request): Promise<Response> {
  const denied = await requireAdmin(request);
  if (denied) return denied;
  const name = new URL(request.url).searchParams.get("name")?.trim() ?? "";
  if (!name) return Response.json({ error: "name is required" }, { status: 400 });
  try {
    const res = await deleteComponent(name);
    if (!res.deleted) return Response.json({ error: "component not found" }, { status: 404 });
    return Response.json({ name, deleted: true });
  } catch (err) {
    return Response.json(
      { error: (err as Error).message ?? "failed to delete component" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request): Promise<Response> {
  const denied = await requireAdmin(request);
  if (denied) return denied;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid JSON body" }, { status: 400 });
  }

  // Accept either the bundle directly, or { bundle: … } / { text: "<json>" }.
  // An optional { rebind: { oldKey: newKey | null } } remaps asset URLs (H3).
  const obj = body && typeof body === "object" ? (body as Record<string, unknown>) : null;
  const raw =
    obj && "bundle" in obj ? obj.bundle : obj && "text" in obj ? obj.text : body;
  const rebind =
    obj && obj.rebind && typeof obj.rebind === "object"
      ? (obj.rebind as Record<string, string | null>)
      : undefined;

  // A kit bundle (`bizbeecms.kit`) installs MANY components in one step
  // (component-kits Slice 4). Detect the envelope and route to the kit path,
  // which re-validates EACH component through the SAME single-import trust
  // boundary (`parseKitBundle` loops `parsePortableComponent`).
  const rawObj =
    typeof raw === "string"
      ? (() => {
          try {
            return JSON.parse(raw) as unknown;
          } catch {
            return null;
          }
        })()
      : raw;
  if (rawObj && typeof rawObj === "object" && (rawObj as { format?: unknown }).format === KIT_FORMAT) {
    return importKit(raw);
  }

  const parsed = parsePortableComponent(raw, { rebind });
  if (!parsed.ok) {
    return Response.json({ error: parsed.errors.join("; ") }, { status: 400 });
  }

  try {
    const res = await upsertImportedComponent(parsed.component);
    // Surface the asset deps the imported component still references so the UI
    // can warn about assets the target Site may be missing (H3). And surface the
    // NESTED-COMPONENT deps that aren't installed here (H3b) — we don't auto-
    // install; the human must import those components first.
    const missingComponents = await missingComponentNames(parsed.componentDeps);
    return Response.json(
      { ...res, assets: parsed.assets, missingComponents },
      { status: res.action === "created" ? 201 : 200 },
    );
  } catch (err) {
    return Response.json(
      { error: (err as Error).message ?? "failed to import component" },
      { status: 500 },
    );
  }
}

/**
 * Install a kit bundle (component-kits Slice 4): validate the envelope + EACH
 * component through `parseKitBundle` (which loops the single-import trust
 * boundary), then upsert every valid component with `sourceKit=<kit name>` so the
 * page-builder rail groups them — mirroring the premade-kit route's loop. Skips
 * (and reports) any component that fails validation rather than failing the whole
 * import, like single-import's skip posture.
 */
async function importKit(raw: unknown): Promise<Response> {
  const parsed = parseKitBundle(raw);
  if (!parsed.ok) {
    return Response.json({ error: parsed.errors.join("; ") }, { status: 400 });
  }
  if (parsed.components.length === 0) {
    return Response.json(
      { error: `no valid components in kit: ${parsed.errors.join("; ") || "empty"}` },
      { status: 400 },
    );
  }
  try {
    const results = [];
    for (const c of parsed.components) {
      results.push(await upsertImportedComponent(c, undefined, parsed.name));
    }
    const created = results.filter((r) => r.action === "created").length;
    const updated = results.filter((r) => r.action === "updated").length;
    const missingComponents = await missingComponentNames(parsed.componentDeps);
    return Response.json(
      {
        kit: parsed.name,
        installed: results,
        created,
        updated,
        skipped: parsed.errors,
        assets: parsed.assets,
        missingComponents,
      },
      { status: 200 },
    );
  } catch (err) {
    return Response.json(
      { error: (err as Error).message ?? "failed to import kit" },
      { status: 500 },
    );
  }
}
