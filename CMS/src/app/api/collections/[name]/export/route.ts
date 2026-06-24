/**
 * content-collections — export a collection's items as CSV or JSON.
 *
 *   GET ?format=csv|json  → a downloadable file of all items (live + archived).
 *
 * `[name]` is the `content_<slug>` table name. Gated to CMS Admin. Reuses the
 * Slice-3 `listItems` (fenced, parameterized) + the registry field list, then the
 * PURE serializer. id/created_at/updated_at/archived_at are dropped (system-managed,
 * not round-tripped); slug + status are kept.
 */
import { requireAdmin } from "@/lib/auth/guard";
import { listItems } from "@/db/item-store";
import { getCollection } from "@/db/collection-store";
import { rowsToCsv, exportFilename } from "@/lib/content/import-export";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ name: string }> },
): Promise<Response> {
  const denied = await requireAdmin(request);
  if (denied) return denied;
  const { name } = await params;
  const format = new URL(request.url).searchParams.get("format") === "json" ? "json" : "csv";

  try {
    const view = await getCollection(name);
    if (!view) return Response.json({ error: "collection not found" }, { status: 404 });

    const result = await listItems(name, { archived: "all", limit: 1000 });
    if (!result.ok) return Response.json({ error: result.error }, { status: result.status });

    const filename = exportFilename(name, format);
    if (format === "json") {
      return new Response(JSON.stringify(result.plan, null, 2), {
        headers: {
          "content-type": "application/json; charset=utf-8",
          "content-disposition": `attachment; filename="${filename}"`,
        },
      });
    }
    return new Response(rowsToCsv(result.plan, view.fields), {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (err) {
    return Response.json({ error: (err as Error).message ?? "export failed" }, { status: 500 });
  }
}
