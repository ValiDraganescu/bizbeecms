/**
 * CMS per-Site brand/design/AI-persona settings REST endpoint (Milestone 2, epic E2).
 *
 * GET → the Site identity `{ brandName, tagline, voice, design, aiPersona }`.
 * PUT → upsert it (validated server-side via `normalizeSiteIdentity`: each field
 *       trimmed + length-bounded; unknown keys dropped).
 *
 * These values feed the AI chat system prompt (api/chat/route.ts) so generated
 * components/pages match the Site's identity. Pure validation lives in
 * `lib/settings/site-settings.ts`; D1 read/write in `db/settings-store.ts`.
 *
 * REST-only, no server actions (PM directive — server actions 500 on
 * OpenNext/Workers). Live D1 needs a real binding (HITL); only the offline
 * normalize/validate path is exercisable here.
 */
import { getSiteIdentity, setSiteIdentity } from "@/db/settings-store";
import { requireAdmin } from "@/lib/auth/guard";
import { PAGES_CACHE_TAG } from "@/lib/render/edge-cache";
import { purgeEdgeTags } from "@/lib/render/purge-edge";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const denied = await requireAdmin(request);
  if (denied) return denied;
  try {
    return Response.json(await getSiteIdentity());
  } catch (err) {
    return Response.json(
      { error: (err as Error).message ?? "failed to load site identity" },
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
    return Response.json({ error: "invalid JSON body" }, { status: 400 });
  }

  // setSiteIdentity normalizes (trims/clamps/drops unknown keys), so the client
  // adopts the normalized truth from the response.
  try {
    const saved = await setSiteIdentity(body);
    // Brand identity feeds published renders (e.g. brand name) — blast the
    // shared pages tag. Best-effort.
    await purgeEdgeTags(PAGES_CACHE_TAG);
    return Response.json(saved);
  } catch (err) {
    return Response.json(
      { error: (err as Error).message ?? "failed to save site identity" },
      { status: 500 },
    );
  }
}
