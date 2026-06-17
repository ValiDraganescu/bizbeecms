"use server";

import { revalidatePath } from "next/cache";
import { isCountryCode, type CountryCode } from "@/lib/auth/countries";
import { getCurrentUser, getUserCountries } from "@/lib/auth/user";
import {
  authorizeSiteCountry,
  canManageSiteByCountry,
  canUserCreateSite,
} from "@/lib/site/authz";
import {
  createSite,
  findSiteById,
  isSlugTaken,
  isValidSlug,
  listAssignableUsers,
  setSiteUsers,
  updateSite,
} from "@/lib/site/site";

export type SiteErrorKey =
  | "nameRequired"
  | "slugRequired"
  | "slugInvalid"
  | "slugTaken"
  | "countryInvalid"
  | "notAllowed"
  | "countryNotAllowed"
  | "notFound"
  | "unknown";

export type SiteFormState = {
  error?: SiteErrorKey;
  /** On success, the saved Site id (caller decides where to go). */
  savedId?: string;
  /** Preserve form input on error. */
  name?: string;
  slug?: string;
  country?: string;
};

/** Parse the country field: empty / "GLOBAL" → null; else a validated code. */
function parseCountry(raw: string): CountryCode | null | "invalid" {
  if (raw === "" || raw === "GLOBAL") return null;
  return isCountryCode(raw) ? raw : "invalid";
}

type ParsedSite = {
  name: string;
  slug: string;
  country: CountryCode | null;
};

/** Shared field parse + validation for create/update. */
function parseSiteForm(
  formData: FormData,
): { ok: true; value: ParsedSite } | { ok: false; state: SiteFormState } {
  const name = String(formData.get("name") ?? "").trim();
  const slug = String(formData.get("slug") ?? "")
    .trim()
    .toLowerCase();
  const countryRaw = String(formData.get("country") ?? "");
  const echo = { name, slug, country: countryRaw };

  if (!name) return { ok: false, state: { error: "nameRequired", ...echo } };
  if (!slug) return { ok: false, state: { error: "slugRequired", ...echo } };
  if (!isValidSlug(slug))
    return { ok: false, state: { error: "slugInvalid", ...echo } };

  const country = parseCountry(countryRaw);
  if (country === "invalid")
    return { ok: false, state: { error: "countryInvalid", ...echo } };

  return { ok: true, value: { name, slug, country } };
}

export async function createSiteAction(
  _prev: SiteFormState,
  formData: FormData,
): Promise<SiteFormState> {
  const user = await getCurrentUser();
  if (!user || !canUserCreateSite(user)) return { error: "notAllowed" };

  const parsed = parseSiteForm(formData);
  if (!parsed.ok) return parsed.state;
  const { name, slug, country } = parsed.value;
  const echo = { name, slug, country: country ?? "GLOBAL" };

  // Authorization: country must be within the creator's scope (server-enforced).
  const actorCountries = await getUserCountries(user.id);
  const authzError = authorizeSiteCountry(user, actorCountries, country);
  if (authzError) return { error: authzError, ...echo };

  if (await isSlugTaken(slug)) return { error: "slugTaken", ...echo };

  try {
    const site = await createSite({ name, slug, country, createdBy: user.id });
    revalidatePath("/sites");
    return { savedId: site.id };
  } catch {
    return { error: "unknown", ...echo };
  }
}

export async function updateSiteAction(
  siteId: string,
  _prev: SiteFormState,
  formData: FormData,
): Promise<SiteFormState> {
  const user = await getCurrentUser();
  if (!user || !canUserCreateSite(user)) return { error: "notAllowed" };

  const site = await findSiteById(siteId);
  if (!site) return { error: "notFound" };

  // Must be able to reach the Site as it stands (country-based Admin reach).
  const actorCountries = await getUserCountries(user.id);
  if (!canManageSiteByCountry(user, actorCountries, site))
    return { error: "notAllowed" };

  const parsed = parseSiteForm(formData);
  if (!parsed.ok) return parsed.state;
  const { name, slug, country } = parsed.value;
  const echo = { name, slug, country: country ?? "GLOBAL" };

  // The new country must also be within the editor's scope.
  const authzError = authorizeSiteCountry(user, actorCountries, country);
  if (authzError) return { error: authzError, ...echo };

  if (await isSlugTaken(slug, siteId)) return { error: "slugTaken", ...echo };

  try {
    await updateSite(siteId, { name, slug, country });
    revalidatePath("/sites");
    revalidatePath(`/sites/${siteId}`);
    return { savedId: siteId };
  } catch {
    return { error: "unknown", ...echo };
  }
}

export type AssignState = { error?: SiteErrorKey; saved?: boolean };

export async function assignUsersAction(
  siteId: string,
  _prev: AssignState,
  formData: FormData,
): Promise<AssignState> {
  const user = await getCurrentUser();
  if (!user || !canUserCreateSite(user)) return { error: "notAllowed" };

  const site = await findSiteById(siteId);
  if (!site) return { error: "notFound" };

  const actorCountries = await getUserCountries(user.id);
  if (!canManageSiteByCountry(user, actorCountries, site))
    return { error: "notAllowed" };

  // Only accept ids that are genuinely assignable to this Site's country —
  // the client list is bounded the same way, but re-enforce it here.
  const requested = new Set(formData.getAll("user").map(String));
  const eligible = await listAssignableUsers(site.country as CountryCode | null);
  const userIds = eligible.filter((u) => requested.has(u.id)).map((u) => u.id);

  try {
    await setSiteUsers(siteId, userIds);
    revalidatePath(`/sites/${siteId}`);
    return { saved: true };
  } catch {
    return { error: "unknown" };
  }
}
