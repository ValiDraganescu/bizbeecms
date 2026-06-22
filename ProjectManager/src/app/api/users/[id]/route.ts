import { NextResponse } from "next/server";
import { isCountryCode, type CountryCode } from "@/lib/auth/countries";
import { authorizeAssign } from "@/lib/auth/manage-users";
import { canChangeRole, canRemoveUser } from "@/lib/auth/removal";
import {
  deleteUser,
  findUserById,
  getCurrentUser,
  getUserCountries,
  getUserTagIds,
  setUserCountries,
  setUserRole,
  setUserTags,
} from "@/lib/auth/user";
import type { Role } from "@/db/schema";

const ROLES: Role[] = ["SuperAdmin", "Admin", "Manager", "Editor"];

/** Admin+ may reach the user-management routes at all. */
function canManageUsers(role: Role): boolean {
  return role === "SuperAdmin" || role === "Admin";
}

/**
 * PATCH /api/users/[id] — change a user's role + set their countries + tags.
 *
 * Two independent gates, BOTH enforced:
 *   1. Tier (removal.ts `canChangeRole`): the actor must outrank the target's
 *      current AND destination tier (no self-re-role, no elevation to/above own
 *      tier). Required whenever the role changes; even a no-op needs to outrank.
 *   2. Subset (manage-users.ts `authorizeAssign`): a scoped actor may only grant
 *      countries/tags within their OWN scope (mirrors authorizeInvite). A global
 *      actor may grant anything.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const actor = await getCurrentUser();
  if (!actor || !canManageUsers(actor.role)) {
    return NextResponse.json({ error: "notAllowed" }, { status: 403 });
  }
  const { id } = await params;

  const target = await findUserById(id);
  if (!target) return NextResponse.json({ error: "notFound" }, { status: 404 });

  let body: { role?: unknown; countries?: unknown; tagIds?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "unknown" }, { status: 400 });
  }

  // Role: default to the target's current role (countries/tags-only edit).
  const newRole =
    body.role === undefined ? target.role : (body.role as Role);
  if (!ROLES.includes(newRole)) {
    return NextResponse.json({ error: "roleNotAllowed" }, { status: 400 });
  }

  // Countries: validated against the fixed code set.
  const countries = (Array.isArray(body.countries) ? body.countries : [])
    .map(String)
    .filter(isCountryCode) as CountryCode[];
  if (
    Array.isArray(body.countries) &&
    body.countries.length !== countries.length
  ) {
    return NextResponse.json({ error: "countryNotAllowed" }, { status: 400 });
  }

  const tagIds = (Array.isArray(body.tagIds) ? body.tagIds : []).map(String);

  // Gate 1 — tier. canChangeRole also blocks self-edits and re-roling a peer/superior.
  if (!canChangeRole(actor, target, newRole)) {
    return NextResponse.json({ error: "notAllowed" }, { status: 403 });
  }

  // Gate 2 — subset. The actor may grant only countries/tags within their scope.
  const [actorCountries, actorTagIds] = await Promise.all([
    getUserCountries(actor.id),
    getUserTagIds(actor.id),
  ]);
  const subsetError = authorizeAssign(
    { role: actor.role, countries: actorCountries, tagIds: actorTagIds },
    countries,
    tagIds,
  );
  if (subsetError) {
    return NextResponse.json({ error: subsetError }, { status: 403 });
  }

  // Apply. Order is independent; role last so a failed scope write doesn't
  // leave a re-roled-but-unscoped user.
  await setUserCountries(id, countries);
  await setUserTags(id, tagIds);
  const updated = await setUserRole(id, newRole);
  return NextResponse.json({ user: updated, countries, tagIds });
}

/**
 * DELETE /api/users/[id] — remove a user.
 *
 * Tier gate only (`canRemoveUser`): the actor must strictly outrank the target,
 * and may not remove themselves. Cascades the user's country/tag/site rows via
 * the schema's onDelete cascade.
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const actor = await getCurrentUser();
  if (!actor || !canManageUsers(actor.role)) {
    return NextResponse.json({ error: "notAllowed" }, { status: 403 });
  }
  const { id } = await params;

  const target = await findUserById(id);
  if (!target) return NextResponse.json({ error: "notFound" }, { status: 404 });

  if (!canRemoveUser(actor, target)) {
    return NextResponse.json({ error: "notAllowed" }, { status: 403 });
  }

  const ok = await deleteUser(id);
  if (!ok) return NextResponse.json({ error: "notFound" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
