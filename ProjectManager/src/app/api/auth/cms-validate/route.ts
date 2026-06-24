import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getCurrentUser, getUserCountries } from "@/lib/auth/user";
import { canManageSiteByCountry } from "@/lib/site/authz";
import { findSiteById, isUserAssignedToSite } from "@/lib/site/site";

/**
 * CMS admin-auth bridge (Sec1). A deployed per-Site CMS Worker has no access to
 * PM's KV session store or D1, so it CANNOT resolve `bizbee_session` itself. It
 * forwards the incoming cookie here and PM stays the single source of truth for
 * authn (session → user) AND authz (does that user reach this Site).
 *
 * Service-to-service: gated by the shared `CMS_AUTH_SECRET` bearer (same pattern
 * as the deployer callback's DEPLOYER_SECRET). The user identity rides in the
 * forwarded `bizbee_session` cookie — `getCurrentUser()` reads it via
 * `cookies()`, so a forwarded cookie resolves exactly like a direct PM request.
 *
 * Body: `{ siteId }`. Returns `{ ok: true, userId, email }` when the resolved PM
 * user reaches that Site (country-reach OR site_users assignment — the same reach
 * the PM site detail/deploy routes enforce), else `{ ok: false }`. `email` is the
 * operator's real verified PM email — the CMS keys its SSO user row on it (and
 * backfills any earlier synthetic `<userId>@pm.sso` row) so operators show up
 * under their real address in the CMS user list.
 *
 * REST route handler, not a server action (server actions 500 on OpenNext).
 */

type Body = { siteId?: unknown };

export async function POST(request: Request): Promise<NextResponse> {
  const { env } = await getCloudflareContext({ async: true });
  const secret = (env as unknown as Record<string, unknown>).CMS_AUTH_SECRET;
  const auth = (request.headers.get("authorization") ?? "").replace(
    /^Bearer\s+/i,
    "",
  );
  if (typeof secret !== "string" || !secret || auth !== secret) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: "badRequest" }, { status: 400 });
  }

  const siteId = typeof body.siteId === "string" ? body.siteId : "";
  if (!siteId) {
    return NextResponse.json({ ok: false, error: "badRequest" }, { status: 400 });
  }

  // Authn: resolve the forwarded session cookie to a PM user.
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false }, { status: 200 });
  }

  // Authz: a PM user with access to THIS Site = a CMS admin. Same reach rule the
  // PM site detail/deploy routes use: country-reach OR explicit assignment.
  const site = await findSiteById(siteId);
  if (!site) {
    return NextResponse.json({ ok: false }, { status: 200 });
  }

  const countries = await getUserCountries(user.id);
  const reaches =
    canManageSiteByCountry(user, countries, site) ||
    (await isUserAssignedToSite(user.id, siteId));

  return NextResponse.json(
    reaches ? { ok: true, userId: user.id, email: user.email } : { ok: false },
    { status: 200 },
  );
}
