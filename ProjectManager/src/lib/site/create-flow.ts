/**
 * The ONE create-Site flow shared by the REST route (`POST /api/sites`) and the
 * MCP tool (`sites_create`): authz → country scope → slug uniqueness → insert →
 * tags. Keeping it here means an assistant can never create a Site the acting
 * user couldn't create in the browser, and both entry points stay in lockstep.
 */
import type { Site, User } from "@/db/schema";
import type { CountryCode } from "@/lib/auth/countries";
import { getUserCountries } from "@/lib/auth/user";
import { listTags } from "@/lib/tags/tags";
import { authorizeSiteCountry, canUserCreateSite } from "./authz";
import { createSite, isSlugTaken, setSiteTags } from "./site";
import { resolveTagRefs } from "./tag-selection";

export type CreateFlowInput = {
  name: string;
  slug: string;
  country: CountryCode | null;
  /** Tag ids or labels; resolved against the managed vocabulary. */
  tagRefs: string[];
  /** Reject (instead of drop) refs that match no tag. MCP sets this. */
  strictTags?: boolean;
};

export type CreateFlowError =
  | { error: "notAllowed" | "countryNotAllowed"; status: 403 }
  | { error: "slugTaken"; status: 409 }
  | { error: "tagsUnknown"; status: 400; unknown: string[] };

export type CreateFlowResult =
  | { ok: true; site: Site; tagIds: string[] }
  | ({ ok: false } & CreateFlowError);

export async function createSiteForActor(
  actor: User,
  input: CreateFlowInput,
): Promise<CreateFlowResult> {
  if (!canUserCreateSite(actor)) return { ok: false, error: "notAllowed", status: 403 };

  const actorCountries = await getUserCountries(actor.id);
  const authzError = authorizeSiteCountry(actor, actorCountries, input.country);
  if (authzError) return { ok: false, error: authzError, status: 403 };

  if (await isSlugTaken(input.slug)) return { ok: false, error: "slugTaken", status: 409 };

  const { ids: tagIds, unknown } = resolveTagRefs(input.tagRefs, await listTags());
  if (input.strictTags && unknown.length > 0) {
    return { ok: false, error: "tagsUnknown", status: 400, unknown };
  }

  const site = await createSite({
    name: input.name,
    slug: input.slug,
    country: input.country,
    createdBy: actor.id,
  });
  if (tagIds.length > 0) await setSiteTags(site.id, tagIds);
  return { ok: true, site, tagIds };
}
