/**
 * external-data-sources Slice 1 — saved requests on a data source
 * (2026-07-02 centralized-request-management revision).
 *
 *   GET  → list the source's saved requests
 *   POST { name, method, path, query?, bodyTemplate?, cacheEnabled?,
 *          cacheTtlSec?, retryable? } → create one. Method may be
 *          GET|POST|PUT|DELETE; path/query/body may carry `{placeholder}`
 *          tokens filled at bind time from component props (Slice 2 encodes).
 *
 * Admin-gated, REST-only. No fetch here — the Slice-2 engine executes.
 */
import { requireAdmin } from "@/lib/auth/guard";
import {
  createDataSourceRequest,
  listDataSourceRequests,
  getDataSource,
} from "@/db/data-source-store";
import { validateRequestInput } from "@/lib/data-sources/validate";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Params): Promise<Response> {
  const denied = await requireAdmin(request);
  if (denied) return denied;
  const { id } = await params;
  try {
    if (!(await getDataSource(id))) {
      return Response.json({ error: "not found" }, { status: 404 });
    }
    return Response.json(await listDataSourceRequests(id));
  } catch (err) {
    return Response.json(
      { error: (err as Error).message ?? "failed to list requests" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request, { params }: Params): Promise<Response> {
  const denied = await requireAdmin(request);
  if (denied) return denied;
  const { id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const checked = validateRequestInput(body);
  if (!checked.ok) return Response.json({ error: checked.error }, { status: 400 });

  try {
    const created = await createDataSourceRequest(id, checked.value);
    if (!created) return Response.json({ error: "not found" }, { status: 404 });
    return Response.json(created, { status: 201 });
  } catch (err) {
    return Response.json(
      { error: (err as Error).message ?? "failed to create request" },
      { status: 500 },
    );
  }
}
