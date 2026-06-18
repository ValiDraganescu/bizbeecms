/**
 * CMS page-management REST endpoint (Milestone 2, epic C2) — the NON-AI
 * counterpart to the `create_page` AI tool. Authors page METADATA only (slug,
 * parent, publish status, per-locale SEO); the block tree is owned by the AI's
 * create_page / the future visual editor (C3), so it's left untouched on update.
 *
 *   GET                 → list all pages (parent slug resolved)
 *   POST  { …meta }     → create a page (empty block tree)
 *   PUT   { id, …meta } → update a page's metadata (blocks preserved)
 *   DELETE ?id=…        → delete a page (refused if it has children)
 *
 * REST-only, no server actions (PM directive — server actions 500 on
 * OpenNext/Workers). Pure validation in `lib/pages/page-meta.ts`; D1 in
 * `db/page-store.ts`. Live D1 needs a real binding (HITL).
 */
import { deletePage, listPages, upsertPageMeta } from "@/db/page-store";
import { validatePageMeta } from "@/lib/pages/page-meta";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  try {
    return Response.json(await listPages());
  } catch (err) {
    return Response.json(
      { error: (err as Error).message ?? "failed to list pages" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request): Promise<Response> {
  return write(request, null);
}

export async function PUT(request: Request): Promise<Response> {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: "invalid JSON body" }, { status: 400 });
  }
  const id = typeof body.id === "string" ? body.id : "";
  if (!id) return Response.json({ error: "id is required for update" }, { status: 400 });
  return persist(body, id);
}

export async function DELETE(request: Request): Promise<Response> {
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return Response.json({ error: "id query param is required" }, { status: 400 });
  try {
    const res = await deletePage(id);
    if (!res.ok) return Response.json({ error: res.errors.join("; ") }, { status: 409 });
    return Response.json({ ok: true });
  } catch (err) {
    return Response.json(
      { error: (err as Error).message ?? "failed to delete page" },
      { status: 500 },
    );
  }
}

async function write(request: Request, id: string | null): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid JSON body" }, { status: 400 });
  }
  return persist(body, id);
}

async function persist(body: unknown, id: string | null): Promise<Response> {
  const v = validatePageMeta(body);
  if (!v.ok) return Response.json({ error: v.errors.join("; ") }, { status: 400 });
  try {
    const res = await upsertPageMeta(v.meta, id);
    if (!res.ok) return Response.json({ error: res.errors.join("; ") }, { status: 409 });
    return Response.json(res, { status: id === null ? 201 : 200 });
  } catch (err) {
    return Response.json(
      { error: (err as Error).message ?? "failed to save page" },
      { status: 500 },
    );
  }
}
