/**
 * CMS search-engine verification settings REST endpoint (seo-robots goal).
 *
 * GET → the per-Site verification tokens `{ google, bing, yandex }`.
 * PUT → upsert them (normalized server-side via `setSiteVerification` →
 *       `normalizeSiteVerification`, which strips any char outside the token
 *       charset and length-bounds each token, so a pasted full tag / injection
 *       attempt can't forge extra <meta> attributes).
 *
 * Tokens are emitted as `Metadata.verification` on the (site) render path; that
 * path is edge-cached but the tokens are stored (visitor-independent) site data,
 * so no purge concern beyond the normal published-page cache (a token change
 * takes effect on next render / cache purge).
 *
 * REST-only, no server actions (PM directive — server actions 500 on
 * OpenNext/Workers).
 */
import { getSiteVerification, setSiteVerification } from "@/db/settings-store";
import { requireAdmin } from "@/lib/auth/guard";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const denied = await requireAdmin(request);
  if (denied) return denied;
  try {
    return Response.json(await getSiteVerification());
  } catch (err) {
    return Response.json(
      { error: (err as Error).message ?? "failed to load verification tokens" },
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
    return Response.json(await setSiteVerification(body));
  } catch (err) {
    return Response.json(
      { error: (err as Error).message ?? "failed to save verification tokens" },
      { status: 500 },
    );
  }
}
