/**
 * CMS manual redirects REST endpoint (seo-robots goal, 301-redirects track #3).
 *
 * GET    → all redirects, newest first (admin list).
 * POST   → add one redirect { fromPath, toPath, status? } — validated up front
 *          (loop/chain/path-shape) with a STABLE error `code` the UI localizes,
 *          then stored via `upsertRedirect` (normalizes paths, drops self-loops).
 * DELETE → remove one by `?id=`.
 *
 * Unlike the robots PUT (which validates by NORMALIZING silently), manual
 * redirects HARD-REJECT loops/chains BEFORE the store write — a chain or a
 * silent overwrite is an operator mistake worth surfacing (see redirects CAVEAT
 * + the robots-caveat "add hard rejects in the route before the store" note).
 *
 * REST-only, no server actions (PM directive — server actions 500 on
 * OpenNext/Workers).
 */
import {
  listRedirects,
  upsertRedirect,
  deleteRedirect,
} from "@/db/redirect-store";
import { validateManualRedirect } from "@/lib/render/redirects";
import { requireAdmin } from "@/lib/auth/guard";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const denied = await requireAdmin(request);
  if (denied) return denied;
  try {
    return Response.json(await listRedirects());
  } catch (err) {
    return Response.json(
      { error: (err as Error).message ?? "failed to load redirects" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request): Promise<Response> {
  const denied = await requireAdmin(request);
  if (denied) return denied;
  let body: { fromPath?: unknown; toPath?: unknown; status?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return Response.json({ error: "invalid JSON body", code: "badJson" }, { status: 400 });
  }
  const fromPath = typeof body.fromPath === "string" ? body.fromPath : "";
  const toPath = typeof body.toPath === "string" ? body.toPath : "";
  const status = body.status === 302 ? 302 : 301;
  try {
    const existing = await listRedirects();
    const err = validateManualRedirect({ fromPath, toPath }, existing);
    if (err) return Response.json({ error: err, code: err }, { status: 400 });
    const row = await upsertRedirect({ fromPath, toPath, status });
    // upsertRedirect returns null only on a self-redirect, which validate already
    // rejected — but guard anyway rather than return a misleading 200.
    if (!row) return Response.json({ error: "selfLoop", code: "selfLoop" }, { status: 400 });
    return Response.json(row, { status: 201 });
  } catch (err) {
    return Response.json(
      { error: (err as Error).message ?? "failed to save redirect" },
      { status: 500 },
    );
  }
}

export async function DELETE(request: Request): Promise<Response> {
  const denied = await requireAdmin(request);
  if (denied) return denied;
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return Response.json({ error: "id required", code: "idRequired" }, { status: 400 });
  try {
    await deleteRedirect(id);
    return Response.json({ ok: true });
  } catch (err) {
    return Response.json(
      { error: (err as Error).message ?? "failed to delete redirect" },
      { status: 500 },
    );
  }
}
