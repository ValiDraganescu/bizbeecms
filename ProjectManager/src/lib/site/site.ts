import { and, desc, eq, inArray, or, isNull } from "drizzle-orm";
import { getDb, schema } from "@/db";
import type { Site, SiteStatus, User } from "@/db/schema";
import { isCountryCode, type CountryCode } from "@/lib/auth/countries";
import { getUserCountries, getUserTagIds } from "@/lib/auth/user";
import { hasGlobalScope } from "./authz";
import { isAssignableToSite } from "./assignable";

// Pure slug helpers live in ./slug (client-safe). Re-export for existing callers.
export { slugify, isValidSlug } from "./slug";

/** True if another Site already uses this slug (optionally excluding one id). */
export async function isSlugTaken(
  slug: string,
  excludeSiteId?: string,
): Promise<boolean> {
  const db = await getDb();
  const [row] = await db
    .select({ id: schema.sites.id })
    .from(schema.sites)
    .where(eq(schema.sites.slug, slug))
    .limit(1);
  if (!row) return false;
  return excludeSiteId ? row.id !== excludeSiteId : true;
}

export async function findSiteById(id: string): Promise<Site | null> {
  const db = await getDb();
  const [site] = await db
    .select()
    .from(schema.sites)
    .where(eq(schema.sites.id, id))
    .limit(1);
  return site ?? null;
}

export type CreateSiteInput = {
  name: string;
  slug: string;
  /** Single country, or null for global (all countries). */
  country: CountryCode | null;
  createdBy: string;
};

/**
 * Insert a Site (status defaults to `draft`) and auto-assign its creator as a
 * manager (a `site_users` row), so the "managed by" list is never empty and the
 * creator can immediately reach the Site by assignment. Slug unique index guards
 * dupes. The creator row is a plain assignment — removable later like any other.
 */
export async function createSite(input: CreateSiteInput): Promise<Site> {
  const db = await getDb();
  const [site] = await db
    .insert(schema.sites)
    .values({
      id: crypto.randomUUID(),
      name: input.name,
      slug: input.slug,
      country: input.country,
      createdBy: input.createdBy,
    })
    .returning();

  await db
    .insert(schema.siteUsers)
    .values({ siteId: site.id, userId: input.createdBy });

  return site;
}

export type UpdateSiteInput = {
  name: string;
  slug: string;
  country: CountryCode | null;
  /** Whether PM auto-mints a per-Site OpenRouter key. */
  openrouterMintingEnabled: boolean;
  /** Monthly spend cap in whole USD for the minted key, or null for no cap. */
  openrouterMonthlyLimitUsd: number | null;
};

/** Update a Site's editable fields. Status/workerName are managed elsewhere. */
export async function updateSite(
  id: string,
  input: UpdateSiteInput,
): Promise<Site | null> {
  const db = await getDb();
  const [site] = await db
    .update(schema.sites)
    .set({
      name: input.name,
      slug: input.slug,
      country: input.country,
      openrouterMintingEnabled: input.openrouterMintingEnabled,
      openrouterMonthlyLimitUsd: input.openrouterMonthlyLimitUsd,
    })
    .where(eq(schema.sites.id, id))
    .returning();
  return site ?? null;
}

/**
 * Set or clear a Site's encrypted OpenRouter key. Pass the already-encrypted
 * ciphertext to set it, or `null` to clear. Never receives plaintext (the route
 * encrypts first) and never reads the column back out.
 */
export async function setSiteOpenrouterKey(
  id: string,
  ciphertextOrNull: string | null,
): Promise<void> {
  const db = await getDb();
  await db
    .update(schema.sites)
    .set({ openrouterApiKeyEncrypted: ciphertextOrNull })
    .where(eq(schema.sites.id, id));
}

/**
 * Sites visible to `user`, newest first.
 *  - SuperAdmin / global Admin: every Site.
 *  - Country-scoped Admin: Sites whose country is in their scope.
 *  - Manager: Sites whose country ∈ scope AND that carry one of the Manager's
 *    tags (pm-roles Slice 3 — AND across the two dimensions).
 *  - Editor (and as a union for scoped Admins/Managers): Sites they're assigned
 *    to via site_users.
 */
export async function listSitesForUser(user: User): Promise<Site[]> {
  const db = await getDb();
  const countries = await getUserCountries(user.id);

  if (hasGlobalScope(user, countries) && user.role !== "Editor") {
    return db
      .select()
      .from(schema.sites)
      .orderBy(desc(schema.sites.createdAt));
  }

  // Scoped reach: by country (Admin), by country AND tag (Manager), UNION by
  // assignment (anyone).
  const assignedIds = await getAssignedSiteIds(user.id);

  let byScope;
  if (user.role === "Admin" && countries.length > 0) {
    byScope = inArray(schema.sites.country, countries);
  } else if (user.role === "Manager" && countries.length > 0) {
    // Manager: country AND tag both required. Find Site ids tagged with one of
    // the Manager's tags, then intersect with the country filter.
    const tagIds = await getUserTagIds(user.id);
    if (tagIds.length > 0) {
      const taggedIds = await getSiteIdsWithAnyTag(tagIds);
      byScope =
        taggedIds.length > 0
          ? and(
              inArray(schema.sites.country, countries),
              inArray(schema.sites.id, taggedIds),
            )
          : undefined;
    }
  }

  const byAssignment =
    assignedIds.length > 0 ? inArray(schema.sites.id, assignedIds) : undefined;

  const clauses = [byScope, byAssignment].filter(Boolean);
  if (clauses.length === 0) return [];

  return db
    .select()
    .from(schema.sites)
    .where(clauses.length === 1 ? clauses[0] : or(...clauses))
    .orderBy(desc(schema.sites.createdAt));
}

/** Site ids carrying at least one of the given tag ids (pm-roles Slice 3). */
async function getSiteIdsWithAnyTag(tagIds: string[]): Promise<string[]> {
  if (tagIds.length === 0) return [];
  const db = await getDb();
  const rows = await db
    .select({ siteId: schema.siteTags.siteId })
    .from(schema.siteTags)
    .where(inArray(schema.siteTags.tagId, tagIds));
  return [...new Set(rows.map((r) => r.siteId))];
}

/** A Site's tag ids (pm-roles Slice 3). */
export async function getSiteTagIds(siteId: string): Promise<string[]> {
  const db = await getDb();
  const rows = await db
    .select({ tagId: schema.siteTags.tagId })
    .from(schema.siteTags)
    .where(eq(schema.siteTags.siteId, siteId));
  return rows.map((r) => r.tagId);
}

/** Replace a Site's tags with `tagIds` (delete-all + insert, full replace). */
export async function setSiteTags(siteId: string, tagIds: string[]): Promise<void> {
  const db = await getDb();
  await db.delete(schema.siteTags).where(eq(schema.siteTags.siteId, siteId));
  if (tagIds.length > 0) {
    await db.insert(schema.siteTags).values(tagIds.map((tagId) => ({ siteId, tagId })));
  }
}

/** Site ids this user is assigned to (via site_users). */
async function getAssignedSiteIds(userId: string): Promise<string[]> {
  const db = await getDb();
  const rows = await db
    .select({ siteId: schema.siteUsers.siteId })
    .from(schema.siteUsers)
    .where(eq(schema.siteUsers.userId, userId));
  return rows.map((r) => r.siteId);
}

/** Whether `user` is assigned to `siteId`. */
export async function isUserAssignedToSite(
  userId: string,
  siteId: string,
): Promise<boolean> {
  const db = await getDb();
  const [row] = await db
    .select({ siteId: schema.siteUsers.siteId })
    .from(schema.siteUsers)
    .where(
      and(
        eq(schema.siteUsers.siteId, siteId),
        eq(schema.siteUsers.userId, userId),
      ),
    )
    .limit(1);
  return row != null;
}

/** User ids assigned to a Site. */
export async function getSiteUserIds(siteId: string): Promise<string[]> {
  const db = await getDb();
  const rows = await db
    .select({ userId: schema.siteUsers.userId })
    .from(schema.siteUsers)
    .where(eq(schema.siteUsers.siteId, siteId));
  return rows.map((r) => r.userId);
}

/**
 * Replace a Site's assigned users with exactly `userIds`. Diffs against the
 * current set so we only insert/delete what changed (the join PK rejects dupes).
 */
export async function setSiteUsers(
  siteId: string,
  userIds: string[],
): Promise<void> {
  const db = await getDb();
  const current = new Set(await getSiteUserIds(siteId));
  const next = new Set(userIds);

  const toAdd = [...next].filter((id) => !current.has(id));
  const toRemove = [...current].filter((id) => !next.has(id));

  if (toAdd.length > 0) {
    await db
      .insert(schema.siteUsers)
      .values(toAdd.map((userId) => ({ siteId, userId })));
  }
  if (toRemove.length > 0) {
    await db
      .delete(schema.siteUsers)
      .where(
        and(
          eq(schema.siteUsers.siteId, siteId),
          inArray(schema.siteUsers.userId, toRemove),
        ),
      );
  }
}

export type AssignableUser = { id: string; email: string };

/**
 * Users that may be assigned to a Site of the given country, for the "managed
 * by" list. The candidate pool is every role (SuperAdmin, Admin, Manager, Editor)
 * bounded by country: a user with global scope (no rows — every SuperAdmin, and
 * global Admins) fits any Site; a country-scoped user fits only Sites in their
 * scope; a global Site accepts only globally-scoped users.
 */
export async function listAssignableUsers(
  siteCountry: CountryCode | null,
): Promise<AssignableUser[]> {
  const db = await getDb();
  const users = await db
    .select({ id: schema.users.id, email: schema.users.email })
    .from(schema.users)
    .orderBy(schema.users.email);

  // Pull every user's country scope once, then filter in memory (small admin set).
  const scopeRows = await db
    .select({
      userId: schema.userCountries.userId,
      country: schema.userCountries.country,
    })
    .from(schema.userCountries);

  const scopeByUser = new Map<string, CountryCode[]>();
  for (const row of scopeRows) {
    if (!isCountryCode(row.country)) continue;
    const list = scopeByUser.get(row.userId) ?? [];
    list.push(row.country);
    scopeByUser.set(row.userId, list);
  }

  return users.filter((u) =>
    isAssignableToSite(scopeByUser.get(u.id) ?? [], siteCountry),
  );
}

/**
 * Update a Site's deploy status (the deploy state-machine writes through here).
 * Optionally set/clear the Cloudflare Worker name in the same update — pass it
 * when a deploy succeeds (the provisioned Worker name) so the row reflects the
 * live deployment. Returns the updated row, or null if the Site is gone.
 */
export async function setSiteDeployStatus(
  id: string,
  status: SiteStatus,
  workerName?: string | null,
  deployedCmsVersion?: string | null,
): Promise<Site | null> {
  const db = await getDb();
  const patch: {
    status: SiteStatus;
    workerName?: string | null;
    deployStartedAt?: Date;
    deployedCmsVersion?: string | null;
  } = { status };
  if (workerName !== undefined) patch.workerName = workerName;
  // Only stamp the deployed CMS version on a successful deploy that reported one;
  // `undefined` leaves the column untouched (a `failed`/`deploying` transition
  // must NOT wipe the last good version).
  if (deployedCmsVersion !== undefined) patch.deployedCmsVersion = deployedCmsVersion;
  // Stamp the start time when a deploy is latched, so staleness is measurable.
  if (status === "deploying") patch.deployStartedAt = new Date();
  const [site] = await db
    .update(schema.sites)
    .set(patch)
    .where(eq(schema.sites.id, id))
    .returning();
  return site ?? null;
}

/** Statuses a Site can hold (re-exported for the UI badge map). */
export const SITE_STATUSES: SiteStatus[] = [
  "draft",
  "deploying",
  "deployed",
  "failed",
];

/** Custom domains attached to a Site, newest first. */
export async function listSiteDomains(siteId: string) {
  const db = await getDb();
  return db
    .select()
    .from(schema.siteDomains)
    .where(eq(schema.siteDomains.siteId, siteId))
    .orderBy(desc(schema.siteDomains.createdAt));
}

/**
 * Record a custom domain on a Site (idempotent on hostname — re-attaching an
 * existing one is a no-op, so the deployer's idempotent /attach-domain stays
 * idempotent end to end). The hostname is globally unique across Sites.
 */
export async function addSiteDomain(
  siteId: string,
  hostname: string,
): Promise<void> {
  const db = await getDb();
  await db
    .insert(schema.siteDomains)
    .values({ id: crypto.randomUUID(), siteId, hostname })
    .onConflictDoNothing({ target: schema.siteDomains.hostname });
}

/** Remove a custom domain from a Site (HOST_MAP cleanup is the deployer's job). */
export async function removeSiteDomain(
  siteId: string,
  hostname: string,
): Promise<void> {
  const db = await getDb();
  await db
    .delete(schema.siteDomains)
    .where(
      and(
        eq(schema.siteDomains.siteId, siteId),
        eq(schema.siteDomains.hostname, hostname),
      ),
    );
}
