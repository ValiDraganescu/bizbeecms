/**
 * CMS block-editing REST endpoint (Milestone 2, epic C3) — the NON-AI visual
 * compose/reorder of a page's block tree, the missing half of C2 (C2 = page
 * metadata; C3 = blocks). Persists via the page-store's dedicated block write
 * contract (`setPageBlocks`), NOT `upsertPageMeta` (metadata) or the AI's
 * `upsertPage`.
 *
 *   GET                    → { id, slug, blocks } for the editor
 *   PUT  { blocks: [...] } → replace the page's block tree
 *
 * REST-only, no server actions (server actions 500 on OpenNext/Workers). Pure
 * block validation in `lib/pages/page-blocks.ts`; D1 in `db/page-store.ts`. The
 * referenced components must exist (the AI's create_page enforces the same so a
 * page never ships hidden-placeholder blocks). Live D1 needs a real binding (HITL).
 */
import { getPageBlocks, missingComponents, setPageBlocks } from "@/db/page-store";
import { validateBlocks } from "@/lib/pages/page-blocks";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  try {
    const page = await getPageBlocks(id);
    if (!page) return Response.json({ error: "page not found" }, { status: 404 });
    return Response.json(page);
  } catch (err) {
    return Response.json(
      { error: (err as Error).message ?? "failed to load page blocks" },
      { status: 500 },
    );
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const v = validateBlocks(body.blocks);
  if (!v.ok) return Response.json({ error: v.errors.join("; ") }, { status: 400 });

  try {
    const missing = await missingComponents(v.componentNames);
    if (missing.length > 0) {
      return Response.json(
        { error: `unknown component(s): ${missing.join(", ")} — create them first` },
        { status: 409 },
      );
    }
    const res = await setPageBlocks(id, v.blocks);
    if (!res.ok) return Response.json({ error: res.errors.join("; ") }, { status: 404 });
    return Response.json({ ok: true });
  } catch (err) {
    return Response.json(
      { error: (err as Error).message ?? "failed to save blocks" },
      { status: 500 },
    );
  }
}
