/**
 * CMS per-Site theme-override settings REST endpoint (Milestone 2, epic E1).
 *
 * GET  → the per-Site theme overrides `{ <token>: <color>, … }`.
 * PUT  → upsert them (validated server-side via `normalizeThemeOverrides`:
 *        only known purpose tokens + safe color values survive).
 *
 * `?mode=dark` targets the DARK override map (`theme_overrides_dark`); the
 * default / `?mode=light` targets the LIGHT map. Dark overrides scope to
 * `[data-theme="dark"]` so a Site can theme dark mode distinctly (see the
 * dark-background bug fix in lib/render/theme.ts).
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
import {
  getThemeOverrides,
  getThemeOverridesDark,
  setThemeOverrides,
  setThemeOverridesDark,
} from "@/db/settings-store";
import { requireAdmin } from "@/lib/auth/guard";

export const dynamic = "force-dynamic";

const isDark = (request: Request) =>
  new URL(request.url).searchParams.get("mode") === "dark";

export async function GET(request: Request): Promise<Response> {
  const denied = await requireAdmin(request);
  if (denied) return denied;
  try {
    const read = isDark(request) ? getThemeOverridesDark : getThemeOverrides;
    return Response.json(await read());
  } catch (err) {
    return Response.json(
      { error: (err as Error).message ?? "failed to load theme overrides" },
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

  // set* normalizes (drops unknown tokens / unsafe values), so garbage is
  // silently sanitized rather than rejected — the client adopts the normalized
  // truth from the response.
  try {
    const write = isDark(request) ? setThemeOverridesDark : setThemeOverrides;
    return Response.json(await write(body));
  } catch (err) {
    return Response.json(
      { error: (err as Error).message ?? "failed to save theme overrides" },
      { status: 500 },
    );
  }
}
