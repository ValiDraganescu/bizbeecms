/**
 * CMS llms.txt template settings REST endpoint (seo-robots goal — user-queued
 * editable-llms.txt track).
 *
 * GET → the stored template string ({ template }); "" when unset (route then
 *       serves the auto-generated /llms.txt).
 * PUT → save the template ({ template }). Unlike the robots PUT (which
 *       normalizes silently), this HARD-REJECTS unknown `{{slot}}` tokens up
 *       front via `unknownSlots` — a bad token would silently vanish to "" in
 *       the served file, an operator mistake worth surfacing (see the
 *       llms-template CAVEAT: validation is the UI/route's job, not the route
 *       that serves /llms.txt). Returns a stable `code: "unknownSlots"` plus the
 *       offending names so the editor can point at exactly what to fix.
 *
 * The served `/llms.txt` is force-dynamic + no-store and edge-cache excluded
 * (dotted root path — worker dot gate), so no purge on write (yet — caching is
 * the next backlog task).
 *
 * REST-only, no server actions (PM directive — server actions 500 on
 * OpenNext/Workers).
 */
import { getLlmsTemplate, setLlmsTemplate } from "@/db/settings-store";
import { requireAdmin } from "@/lib/auth/guard";
import { unknownSlots } from "@/lib/render/llms-template";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const denied = await requireAdmin(request);
  if (denied) return denied;
  try {
    return Response.json({ template: await getLlmsTemplate() });
  } catch (err) {
    return Response.json(
      { error: (err as Error).message ?? "failed to load llms template" },
      { status: 500 },
    );
  }
}

export async function PUT(request: Request): Promise<Response> {
  const denied = await requireAdmin(request);
  if (denied) return denied;
  let body: { template?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return Response.json({ error: "invalid JSON body", code: "badJson" }, { status: 400 });
  }
  const template = typeof body.template === "string" ? body.template : "";
  const bad = unknownSlots(template);
  if (bad.length > 0) {
    return Response.json(
      { error: "unknownSlots", code: "unknownSlots", slots: bad },
      { status: 400 },
    );
  }
  try {
    await setLlmsTemplate(template);
    return Response.json({ template });
  } catch (err) {
    return Response.json(
      { error: (err as Error).message ?? "failed to save llms template" },
      { status: 500 },
    );
  }
}
