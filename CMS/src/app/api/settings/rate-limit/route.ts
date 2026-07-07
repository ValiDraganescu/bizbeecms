/**
 * CMS naughty-robot rate-limit threshold settings REST endpoint
 * (seo-robots goal, rate-limit track 2/2).
 *
 * GET → the per-Site preset `{ preset: "off"|"normal"|"strict" }`.
 * PUT → upsert it (normalized server-side → always a valid preset, garbage/absent
 *       falls back to `normal`, so a bad body never breaks bot defence).
 *
 * The preset gates the worker.ts rate-limit check: `off` skips it, `strict` layers
 * a lower in-isolate cap on top of the fixed binding. worker.ts reads it via a
 * short-TTL in-isolate cache (never a per-request D1 read on the hot gate). Change
 * is release-gated + subject to a ≤30s in-isolate cache window on deployed Sites.
 *
 * REST-only, no server actions (PM directive — server actions 500 on OpenNext/Workers).
 */
import { getRateLimitPreset, setRateLimitPreset } from "@/db/settings-store";
import { requireAdmin } from "@/lib/auth/guard";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const denied = await requireAdmin(request);
  if (denied) return denied;
  try {
    return Response.json({ preset: await getRateLimitPreset() });
  } catch (err) {
    return Response.json(
      { error: (err as Error).message ?? "failed to load rate-limit setting" },
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
    const preset = (body as { preset?: unknown })?.preset;
    return Response.json({ preset: await setRateLimitPreset(preset) });
  } catch (err) {
    return Response.json(
      { error: (err as Error).message ?? "failed to save rate-limit setting" },
      { status: 500 },
    );
  }
}
