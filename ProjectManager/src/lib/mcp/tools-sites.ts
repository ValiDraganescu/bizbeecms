/**
 * MCP tools for Sites (`/sites`): list the org tag vocabulary, list the Sites
 * the acting user can see, and create a Site (name, slug, country, tags).
 * Creation goes through `createSiteForActor` — the exact flow `POST /api/sites`
 * runs — so an assistant can never create what the user couldn't in the UI.
 */
import { COUNTRY_CODES, GLOBAL_COUNTRY, isCountryCode, type CountryCode } from "@/lib/auth/countries";
import { canUserCreateSite } from "@/lib/site/authz";
import { createSiteForActor } from "@/lib/site/create-flow";
import { getSiteTagIds, isSlugTaken, listSitesForUser } from "@/lib/site/site";
import { isValidSlug, slugify } from "@/lib/site/slug";
import { parseTagRefs } from "@/lib/site/tag-selection";
import { listTags } from "@/lib/tags/tags";
import type { ToolDef, ToolResult } from "./mcp-core";
import type { ToolCtx } from "./tools";

const NO_ARGS = { type: "object", properties: {}, additionalProperties: false } as const;

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

export const SITE_TOOLS: ReadonlyArray<ToolDef<ToolCtx>> = [
  {
    name: "tags_list",
    description:
      "List the organisation's managed tag vocabulary (id + label). Tags label Sites and " +
      "scope Managers: a Manager reaches a Site only when country AND a tag match. Use the " +
      "ids or labels with `sites_create`.",
    inputSchema: NO_ARGS,
    run: async () => {
      const tags = await listTags();
      return { ok: true, tags: tags.map((t) => ({ id: t.id, label: t.label })) };
    },
  },
  {
    name: "sites_list",
    description:
      "List the Sites the acting user can see (role/country/tag scoped exactly like the Sites " +
      "page): id, name, slug, country (null = Global), status, deployed CMS version, tags.",
    inputSchema: NO_ARGS,
    run: async (_args, ctx) => {
      const [sites, tags] = await Promise.all([listSitesForUser(ctx.user), listTags()]);
      const labelById = new Map(tags.map((t) => [t.id, t.label]));
      const rows = await Promise.all(
        sites.map(async (s) => ({
          id: s.id,
          name: s.name,
          slug: s.slug,
          country: s.country,
          status: s.status,
          deployedCmsVersion: s.deployedCmsVersion ?? null,
          tags: (await getSiteTagIds(s.id)).map((id) => ({ id, label: labelById.get(id) ?? null })),
        })),
      );
      return { ok: true, total: rows.length, sites: rows };
    },
  },
  {
    name: "sites_create",
    description:
      "Create a new Site (Admin+). `name` is required; `slug` (lowercase letters, digits, " +
      "hyphens; used in the Site's URL) defaults to a slugified name and must be unused; " +
      `\`country\` is one of ${COUNTRY_CODES.join(", ")} or "${GLOBAL_COUNTRY}" (default — all countries; ` +
      "a country-scoped Admin must pick one of their own countries); `tags` are tag ids or " +
      "labels from `tags_list` (unknown tags are rejected, not dropped). The Site starts as a " +
      "draft (not deployed); the creator is auto-assigned as a manager. Returns the new Site.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Display name, e.g. \"Acme Finland\"." },
        slug: { type: "string", description: "URL slug; defaults to slugify(name)." },
        country: {
          type: "string",
          enum: [GLOBAL_COUNTRY, ...COUNTRY_CODES],
          description: `Country scope; "${GLOBAL_COUNTRY}" (default) = all countries.`,
        },
        tags: {
          type: "array",
          items: { type: "string" },
          description: "Tag ids or labels (see tags_list) to attach on create.",
        },
      },
      required: ["name"],
      additionalProperties: false,
    },
    run: async (args, ctx): Promise<ToolResult> => {
      if (!canUserCreateSite(ctx.user)) {
        return { ok: false, error: "notAllowed", message: "Only Admin or SuperAdmin users can create Sites." };
      }
      const name = str(args.name);
      if (!name) return { ok: false, error: "nameRequired", message: "`name` is required." };

      const slug = slugify(str(args.slug) || name);
      if (!isValidSlug(slug)) {
        return { ok: false, error: "slugInvalid", message: `Slug "${slug}" is invalid: use lowercase letters, digits and hyphens.` };
      }

      const countryRaw = str(args.country) || GLOBAL_COUNTRY;
      let country: CountryCode | null = null;
      if (countryRaw !== GLOBAL_COUNTRY) {
        if (!isCountryCode(countryRaw)) {
          return { ok: false, error: "countryInvalid", message: `\`country\` must be "${GLOBAL_COUNTRY}" or one of ${COUNTRY_CODES.join(", ")}.` };
        }
        country = countryRaw;
      }

      if (await isSlugTaken(slug)) {
        return { ok: false, error: "slugTaken", message: `Slug "${slug}" is already in use; pass a different \`slug\`.` };
      }

      const result = await createSiteForActor(ctx.user, {
        name,
        slug,
        country,
        tagRefs: parseTagRefs(args.tags),
        strictTags: true,
      });
      if (!result.ok) {
        if (result.error === "tagsUnknown") {
          return { ok: false, error: "tagsUnknown", message: `Unknown tags: ${result.unknown.join(", ")}. Call tags_list for the vocabulary.`, unknown: result.unknown };
        }
        if (result.error === "countryNotAllowed") {
          return { ok: false, error: "countryNotAllowed", message: "You may only create Sites in your own countries (no Global)." };
        }
        return { ok: false, error: result.error, message: result.error === "slugTaken" ? `Slug "${slug}" is already in use.` : "Not allowed." };
      }
      const s = result.site;
      return {
        ok: true,
        site: { id: s.id, name: s.name, slug: s.slug, country: s.country, status: s.status, tagIds: result.tagIds },
        url: `/sites/${s.id}`,
      };
    },
  },
];
