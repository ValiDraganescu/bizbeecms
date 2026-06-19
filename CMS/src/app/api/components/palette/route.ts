/**
 * Component palette WITH propsSchema for the page-builder Block tab (page-builder epic).
 *
 *   GET → [{ name, propsSchema }] for every component in the Site.
 *
 * The grouped endpoint (`/api/components/grouped`) returns names only — the Block
 * tab settings form additionally needs each component's raw `propsSchema` JSON so
 * it can render a field per declared prop (`parsePropsSchema`). Reuses the SAME
 * `listComponentPalette` the server-rendered C3 block editor already uses; no new
 * data path.
 *
 * REST-only (no server actions). Live D1 read needs a real binding (HITL).
 */
import { listComponentPalette } from "@/db/page-store";
import { requireAdmin } from "@/lib/auth/guard";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const denied = await requireAdmin(request);
  if (denied) return denied;
  try {
    const palette = await listComponentPalette();
    return Response.json({ palette });
  } catch (err) {
    return Response.json(
      { error: (err as Error).message ?? "failed to list component palette" },
      { status: 500 },
    );
  }
}
