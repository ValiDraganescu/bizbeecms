import { NextResponse } from "next/server";
import type { CountryCode } from "@/lib/auth/countries";
import { getCurrentUser, getUserCountries } from "@/lib/auth/user";
import { canManageSiteByCountry, canUserCreateSite } from "@/lib/site/authz";
import { findSiteById, listAssignableUsers, setSiteUsers } from "@/lib/site/site";

type Body = { userIds?: unknown };

/**
 * REST assign-users endpoint (replaces the former server action). Replaces the
 * Site's assignment set. Only ids genuinely assignable to the Site's country are
 * accepted — the client list is bounded the same way, but re-enforce here. On
 * success returns `{ saved: true }`.
 */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id: siteId } = await params;

  const user = await getCurrentUser();
  if (!user || !canUserCreateSite(user)) {
    return NextResponse.json({ error: "notAllowed" }, { status: 403 });
  }

  const site = await findSiteById(siteId);
  if (!site) return NextResponse.json({ error: "notFound" }, { status: 404 });

  const actorCountries = await getUserCountries(user.id);
  if (!canManageSiteByCountry(user, actorCountries, site)) {
    return NextResponse.json({ error: "notAllowed" }, { status: 403 });
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "unknown" }, { status: 400 });
  }

  const requested = new Set(
    Array.isArray(body.userIds) ? body.userIds.map(String) : [],
  );
  const eligible = await listAssignableUsers(site.country as CountryCode | null);
  const userIds = eligible.filter((u) => requested.has(u.id)).map((u) => u.id);

  try {
    await setSiteUsers(siteId, userIds);
    return NextResponse.json({ saved: true });
  } catch {
    return NextResponse.json({ error: "unknown" }, { status: 500 });
  }
}
