/**
 * Kit-bundle PREVIEW endpoint (component-kits: preview-before-install).
 *
 *   POST { bundle | text }  → a READ-ONLY preview of what installing a
 *                             `bizbeecms.kit` bundle would do: per-component
 *                             create-vs-update, the kit's tags, external asset
 *                             deps, and component deps missing on this Site —
 *                             WITHOUT writing anything to D1.
 *
 * The import box installs blind; this lets the operator inspect a kit first.
 * It reuses the SAME trust boundary (`summarizeKitBundle` → `parseKitBundle`),
 * so what the preview shows as valid is exactly what the install would accept.
 * No write path here — `api/components` POST stays the gated install.
 *
 * REST-only (no server actions).
 */
import { listComponentNames } from "@/db/component-store";
import { KIT_FORMAT, summarizeKitBundle } from "@/lib/components/portable";
import { requireAdmin } from "@/lib/auth/guard";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  const denied = await requireAdmin(request);
  if (denied) return denied;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid JSON body" }, { status: 400 });
  }

  // Accept the bundle directly, or { bundle } / { text: "<json>" } — same shape
  // the import POST accepts, so the UI can hand it the same payload.
  const obj = body && typeof body === "object" ? (body as Record<string, unknown>) : null;
  const raw = obj && "bundle" in obj ? obj.bundle : obj && "text" in obj ? obj.text : body;

  // Only kit bundles get a preview — a single-component import has no multi-step
  // surprise to preview. Detect the envelope first for a clear error.
  const rawObj =
    typeof raw === "string"
      ? (() => {
          try {
            return JSON.parse(raw) as unknown;
          } catch {
            return null;
          }
        })()
      : raw;
  if (!rawObj || typeof rawObj !== "object" || (rawObj as { format?: unknown }).format !== KIT_FORMAT) {
    return Response.json({ error: `not a "${KIT_FORMAT}" bundle` }, { status: 400 });
  }

  try {
    const existingNames = await listComponentNames();
    const preview = summarizeKitBundle(raw, existingNames);
    if (!preview.ok) {
      return Response.json({ error: preview.errors.join("; ") }, { status: 400 });
    }
    return Response.json(preview);
  } catch (err) {
    return Response.json(
      { error: (err as Error).message ?? "failed to preview kit" },
      { status: 500 },
    );
  }
}
