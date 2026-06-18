/**
 * CMS per-Site theme-override settings REST endpoint (Milestone 2, epic E1).
 *
 * GET  → the per-Site theme overrides `{ <token>: <color>, … }`.
 * PUT  → upsert them (validated server-side via `normalizeThemeOverrides`:
 *        only known purpose tokens + safe color values survive).
 *
 * The overrides re-theme the published front-end's CSS color tokens without a
 * rebuild (injected as an inline `<style>` after globals on the public route).
 * Pure validation lives in `lib/render/theme.ts`; D1 read/write in
 * `db/settings-store.ts`.
 *
 * REST-only, no server actions (PM directive — server actions 500 on
 * OpenNext/Workers). Live D1 needs a real binding (HITL); only the offline
 * normalize/validate path is exercisable here.
 */
import { getThemeOverrides, setThemeOverrides } from "@/db/settings-store";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  try {
    return Response.json(await getThemeOverrides());
  } catch (err) {
    return Response.json(
      { error: (err as Error).message ?? "failed to load theme overrides" },
      { status: 500 },
    );
  }
}

export async function PUT(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid JSON body" }, { status: 400 });
  }

  // setThemeOverrides normalizes (drops unknown tokens / unsafe values), so
  // garbage is silently sanitized rather than rejected — the client adopts the
  // normalized truth from the response.
  try {
    return Response.json(await setThemeOverrides(body));
  } catch (err) {
    return Response.json(
      { error: (err as Error).message ?? "failed to save theme overrides" },
      { status: 500 },
    );
  }
}
