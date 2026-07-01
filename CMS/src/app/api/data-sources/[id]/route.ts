/**
 * external-data-sources Slice 1 — single data-source endpoint.
 *
 *   GET    → one source (safe DTO — `hasSecret`, NEVER `secretEnc`)
 *   PATCH  → update config; `secret` is write-only three-state: absent = keep,
 *            ""/null = clear, string = replace (shows `••••` client-side)
 *   DELETE → remove the source (saved requests cascade via FK)
 *
 * Admin-gated, REST-only.
 */
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { requireAdmin } from "@/lib/auth/guard";
import {
  deleteDataSource,
  getDataSource,
  updateDataSource,
} from "@/db/data-source-store";
import { validateSourceInput } from "@/lib/data-sources/validate";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

async function kek(): Promise<string> {
  const { env } = await getCloudflareContext({ async: true });
  const e = env as unknown as Record<string, unknown>;
  return typeof e.CMS_AUTH_SECRET === "string" ? e.CMS_AUTH_SECRET : "";
}

export async function GET(request: Request, { params }: Params): Promise<Response> {
  const denied = await requireAdmin(request);
  if (denied) return denied;
  const { id } = await params;
  try {
    const source = await getDataSource(id);
    if (!source) return Response.json({ error: "not found" }, { status: 404 });
    return Response.json(source);
  } catch (err) {
    return Response.json(
      { error: (err as Error).message ?? "failed to read data source" },
      { status: 500 },
    );
  }
}

export async function PATCH(request: Request, { params }: Params): Promise<Response> {
  const denied = await requireAdmin(request);
  if (denied) return denied;
  const { id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const checked = validateSourceInput(body);
  if (!checked.ok) return Response.json({ error: checked.error }, { status: 400 });

  // Write-only secret: absent = keep, "" / null = clear, string = replace.
  const obj = body as Record<string, unknown>;
  let secret: string | null | undefined = undefined;
  if ("secret" in obj) {
    secret = typeof obj.secret === "string" && obj.secret !== "" ? obj.secret : null;
  }

  const secretKey = await kek();
  if (typeof secret === "string" && !secretKey) {
    return Response.json({ error: "encryption not configured" }, { status: 500 });
  }

  try {
    const source = await updateDataSource(id, checked.value, secret, secretKey);
    if (!source) return Response.json({ error: "not found" }, { status: 404 });
    return Response.json(source);
  } catch (err) {
    return Response.json(
      { error: (err as Error).message ?? "failed to update data source" },
      { status: 500 },
    );
  }
}

export async function DELETE(request: Request, { params }: Params): Promise<Response> {
  const denied = await requireAdmin(request);
  if (denied) return denied;
  const { id } = await params;
  try {
    const removed = await deleteDataSource(id);
    if (!removed) return Response.json({ error: "not found" }, { status: 404 });
    return Response.json({ ok: true });
  } catch (err) {
    return Response.json(
      { error: (err as Error).message ?? "failed to delete data source" },
      { status: 500 },
    );
  }
}
