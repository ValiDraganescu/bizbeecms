/**
 * "Where is this component used?" — the live pages a component edit would affect.
 *
 *   GET /api/components/<name>/usage → { usage: [{ pageId, slug, direct }] }
 *
 * Blast radius over PUBLISHED page content (direct block references + transitive
 * composition-tag references). The Develop UI shows this before publish so an
 * edit's reach is informed, not silent.
 */
import { requireAdmin } from "@/lib/auth/guard";
import { getComponentUsage, getComponentDraftState } from "@/db/component-store";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ name: string }> },
): Promise<Response> {
  const denied = await requireAdmin(request);
  if (denied) return denied;

  const { name } = await params;
  try {
    const [usage, hasDraft] = await Promise.all([
      getComponentUsage(name),
      getComponentDraftState(name),
    ]);
    return Response.json({ usage, hasDraft });
  } catch (err) {
    return Response.json(
      { error: `failed to load usage: ${(err as Error).message}` },
      { status: 500 },
    );
  }
}
