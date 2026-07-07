/**
 * CMS robots.txt settings REST endpoint (seo-robots goal, robots.txt track #2).
 *
 * GET  → the per-Site robots config `{ groups[], freeText }`.
 * PUT  → upsert it (normalized server-side via `setRobotsConfig` →
 *        `normalizeRobotsConfig`, which strips CR/LF/`:` injection and drops
 *        non-`/` paths — the served file is line-oriented so unsanitized
 *        UAs/paths could forge rules).
 *
 * The served `/robots.txt` is force-dynamic + no-store and is edge-cache
 * excluded (dotted root path — worker dot gate), so no purge on write.
 *
 * REST-only, no server actions (PM directive — server actions 500 on
 * OpenNext/Workers).
 */
import { getRobotsConfig, setRobotsConfig } from "@/db/settings-store";
import { requireAdmin } from "@/lib/auth/guard";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const denied = await requireAdmin(request);
  if (denied) return denied;
  try {
    return Response.json(await getRobotsConfig());
  } catch (err) {
    return Response.json(
      { error: (err as Error).message ?? "failed to load robots config" },
      { status: 500 },
    );
  }
}

export async function PUT(request: Request): Promise<Response> {
  const denied = await requireAdmin(request);
  if (denied) return denied;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid JSON body", code: "badJson" }, { status: 400 });
  }
  try {
    // setRobotsConfig normalizes defensively (garbage → seeded default), so an
    // empty/blank config never wipes the served file to nothing.
    return Response.json(await setRobotsConfig(body));
  } catch (err) {
    return Response.json(
      { error: (err as Error).message ?? "failed to save robots config" },
      { status: 500 },
    );
  }
}
