/**
 * external-data-sources Slice 1 — data-sources collection endpoint.
 *
 *   GET  → list sources (safe DTOs — `hasSecret` boolean, NEVER `secretEnc`)
 *   POST { name, baseUrl, authType, authParam?, secret? } → create a source;
 *          the secret is encrypted at rest (secret-box, KEK = CMS_AUTH_SECRET)
 *          and is write-only from here on.
 *
 * Admin-gated. REST-only, no server actions (PM directive). URL validation
 * (absolute http(s), internal hosts blocked) lives in lib/data-sources/validate.
 */
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { requireAdmin } from "@/lib/auth/guard";
import { createDataSource, listDataSources } from "@/db/data-source-store";
import { validateSourceInput } from "@/lib/data-sources/validate";

export const dynamic = "force-dynamic";

/** Read the secret-box KEK (CMS_AUTH_SECRET) from the Worker env. */
async function kek(): Promise<string> {
  const { env } = await getCloudflareContext({ async: true });
  const e = env as unknown as Record<string, unknown>;
  return typeof e.CMS_AUTH_SECRET === "string" ? e.CMS_AUTH_SECRET : "";
}

export async function GET(request: Request): Promise<Response> {
  const denied = await requireAdmin(request);
  if (denied) return denied;
  try {
    return Response.json(await listDataSources());
  } catch (err) {
    return Response.json(
      { error: (err as Error).message ?? "failed to list data sources" },
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

  const checked = validateSourceInput(body);
  if (!checked.ok) return Response.json({ error: checked.error }, { status: 400 });

  const rawSecret = (body as { secret?: unknown }).secret;
  const secret = typeof rawSecret === "string" && rawSecret !== "" ? rawSecret : null;
  if (checked.value.authType !== "none" && !secret) {
    return Response.json(
      { error: "secret is required for this auth type" },
      { status: 400 },
    );
  }

  const secretKey = await kek();
  if (secret && !secretKey) {
    return Response.json({ error: "encryption not configured" }, { status: 500 });
  }

  try {
    const source = await createDataSource(checked.value, secret, secretKey);
    return Response.json(source, { status: 201 });
  } catch (err) {
    return Response.json(
      { error: (err as Error).message ?? "failed to create data source" },
      { status: 500 },
    );
  }
}
