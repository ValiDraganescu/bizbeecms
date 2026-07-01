/**
 * CMS page DRAFT REST endpoint (Milestone 2, page-builder Versioning slice 3) —
 * the page-builder shell's auto-save target. Writes go to the page's DRAFT
 * `page_version` row (NOT `page.blocks`); the public route still renders the
 * PUBLISHED version, the preview renders the draft (slice 2).
 *
 *   GET                    → { id, blocks } — the current draft (create-if-absent)
 *   PUT  { blocks: [...] } → overwrite the draft's blocks (saveDraftBlocks)
 *
 * REST-only, no server actions (they 500 on OpenNext/Workers). Pure block
 * validation in `lib/pages/page-blocks.ts`; version algebra in
 * `lib/pages/page-version.ts`; D1 in `db/page-version-store.ts`. The shell's
 * Save button and the debounced auto-save both PUT here.
 */
import { getDraft, saveDraftBlocks } from "@/db/page-version-store";
import { missingComponents } from "@/db/page-store";
import { validateBlocks, topLevelBlockIds } from "@/lib/pages/page-blocks";
import { requireAdmin } from "@/lib/auth/guard";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const denied = await requireAdmin(request);
  if (denied) return denied;
  const { id } = await params;
  try {
    const draft = await getDraft(id);
    if (!draft) return Response.json({ error: "page not found" }, { status: 404 });
    return Response.json({ id, blocks: JSON.parse(draft.blocks) as unknown });
  } catch (err) {
    return Response.json(
      { error: (err as Error).message ?? "failed to load draft" },
      { status: 500 },
    );
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const denied = await requireAdmin(request);
  if (denied) return denied;
  const { id } = await params;
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: "invalid JSON body" }, { status: 400 });
  }

  // Grandfather top-level blocks already saved on this page (the "top level is
  // Sections only" rule only rejects NEW strays).
  const current = await getDraft(id);
  if (!current) return Response.json({ error: "page not found" }, { status: 404 });
  const v = validateBlocks(body.blocks, {
    grandfatheredTopLevelIds: topLevelBlockIds(current.blocks),
  });
  if (!v.ok) return Response.json({ error: v.errors.join("; ") }, { status: 400 });

  try {
    const missing = await missingComponents(v.componentNames);
    if (missing.length > 0) {
      return Response.json(
        { error: `unknown component(s): ${missing.join(", ")} — create them first` },
        { status: 409 },
      );
    }
    // meta unchanged by the blocks editor — preserve the draft's current meta.
    const saved = await saveDraftBlocks(id, {
      blocks: JSON.stringify(v.blocks),
      meta: current.meta,
    });
    if (!saved) return Response.json({ error: "page not found" }, { status: 404 });
    return Response.json({ ok: true });
  } catch (err) {
    return Response.json(
      { error: (err as Error).message ?? "failed to save draft" },
      { status: 500 },
    );
  }
}
