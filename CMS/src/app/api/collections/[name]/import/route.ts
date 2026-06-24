/**
 * content-collections — import items into a collection from CSV or JSON.
 *
 *   POST { format: "csv"|"json", text: string }  → bulk-create items.
 *
 * `[name]` is the `content_<slug>` table name. Gated to CMS Admin. The PURE parser
 * shapes rows; each row goes through the Slice-3 `createItem` (full validate +
 * coerce + fenced parameterized INSERT) — no freeform SQL, no skipped validation.
 * Per-row failures are collected (continue-on-error) so a bad row doesn't abort the
 * batch. Returns { created, failed, errors[] }.
 */
import { requireAdmin } from "@/lib/auth/guard";
import { createItem } from "@/db/item-store";
import { getCollection } from "@/db/collection-store";
import { parseImport } from "@/lib/content/import-export";

export const dynamic = "force-dynamic";

/** Hard cap so a single import can't fan out into thousands of D1 writes. */
const MAX_IMPORT_ROWS = 1000;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ name: string }> },
): Promise<Response> {
  const denied = await requireAdmin(request);
  if (denied) return denied;
  const { name } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid JSON body" }, { status: 400 });
  }
  const obj = body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : {};
  const format = obj.format === "json" ? "json" : "csv";
  const text = typeof obj.text === "string" ? obj.text : "";

  try {
    const view = await getCollection(name);
    if (!view) return Response.json({ error: "collection not found" }, { status: 404 });

    const parsed = parseImport(text, format);
    if (!parsed.ok) return Response.json({ error: parsed.error }, { status: 400 });
    if (parsed.rows.length > MAX_IMPORT_ROWS) {
      return Response.json(
        { error: `too many rows (${parsed.rows.length}); max ${MAX_IMPORT_ROWS}` },
        { status: 400 },
      );
    }

    let created = 0;
    const errors: { row: number; error: string }[] = [];
    for (let i = 0; i < parsed.rows.length; i++) {
      const res = await createItem(name, parsed.rows[i]);
      if (res.ok) created++;
      else errors.push({ row: i + 1, error: res.error });
    }

    return Response.json({ created, failed: errors.length, errors });
  } catch (err) {
    return Response.json({ error: (err as Error).message ?? "import failed" }, { status: 500 });
  }
}
