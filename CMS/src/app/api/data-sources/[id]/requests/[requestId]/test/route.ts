/**
 * external-data-sources Slice 4 — test-call endpoint for a saved request.
 *
 *   POST { params?: Record<string,string> } → run the request LIVE through the
 *   central fetch engine and return the upstream result so the operator can see
 *   the response shape and build dot-path maps.
 *
 * Admin-gated. The secret is decrypted server-side and injected by the engine —
 * it never appears in the response (only the upstream JSON does). Cache is
 * BYPASSED (`cache: null`): a test must show the live response, and test calls
 * must not pollute the render cache. Upstream failure is a 200 with
 * `{ ok: false, … }` — the route succeeded; the upstream didn't.
 */
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { requireAdmin } from "@/lib/auth/guard";
import {
  getDataSource,
  listDataSourceRequests,
  decryptSourceSecret,
} from "@/db/data-source-store";
import { fetchSource, type RequestParams } from "@/lib/data-sources/fetch";
import type { AuthType, HttpMethod } from "@/lib/data-sources/validate";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string; requestId: string }> };

async function kek(): Promise<string> {
  const { env } = await getCloudflareContext({ async: true });
  const e = env as unknown as Record<string, unknown>;
  return typeof e.CMS_AUTH_SECRET === "string" ? e.CMS_AUTH_SECRET : "";
}

export async function POST(request: Request, { params }: Params): Promise<Response> {
  const denied = await requireAdmin(request);
  if (denied) return denied;
  const { id, requestId } = await params;

  let body: unknown = {};
  try {
    body = await request.json();
  } catch {
    /* empty body = no test params */
  }
  const rawParams = (body as { params?: unknown }).params;
  const testParams: RequestParams = {};
  if (rawParams && typeof rawParams === "object" && !Array.isArray(rawParams)) {
    for (const [k, v] of Object.entries(rawParams as Record<string, unknown>)) {
      if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") {
        testParams[k] = v;
      }
    }
  }

  try {
    const source = await getDataSource(id);
    if (!source) return Response.json({ error: "not found" }, { status: 404 });
    const saved = (await listDataSourceRequests(id)).find((r) => r.id === requestId);
    if (!saved) return Response.json({ error: "not found" }, { status: 404 });

    const secret = source.hasSecret ? await decryptSourceSecret(id, await kek()) : null;

    const result = await fetchSource(
      {
        id: source.id,
        baseUrl: source.baseUrl,
        authType: source.authType as AuthType,
        authParam: source.authParam,
        secret,
      },
      {
        id: saved.id,
        method: saved.method as HttpMethod,
        path: saved.path,
        query: saved.query,
        bodyTemplate: saved.bodyTemplate,
        cacheEnabled: false, // live test — never read/write the render cache
        cacheTtlSec: saved.cacheTtlSec,
        retryable: saved.retryable,
      },
      testParams,
      { cache: null },
    );
    return Response.json(result);
  } catch (err) {
    return Response.json(
      { error: (err as Error).message ?? "test call failed" },
      { status: 500 },
    );
  }
}
