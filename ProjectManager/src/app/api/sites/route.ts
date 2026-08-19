import { NextResponse } from "next/server";
import { isCountryCode, type CountryCode } from "@/lib/auth/countries";
import { getCurrentUser } from "@/lib/auth/user";
import { canUserCreateSite } from "@/lib/site/authz";
import { createSiteForActor } from "@/lib/site/create-flow";
import { isValidSlug } from "@/lib/site/site";
import { parseTagRefs } from "@/lib/site/tag-selection";
import { parseOpenrouterMinting } from "@/lib/site/openrouter-minting";
import { coerceTimeoutMin } from "@/lib/deploy/build-timeout";

export type SiteErrorKey =
  | "nameRequired"
  | "slugRequired"
  | "slugInvalid"
  | "slugTaken"
  | "countryInvalid"
  /** One or more requested tags aren't in the managed vocabulary (MCP strict mode). */
  | "tagsUnknown"
  | "notAllowed"
  | "countryNotAllowed"
  | "notFound"
  /** The monthly quota would push all sites' quotas past the AI credit pool. */
  | "oversell"
  | "unknown";

export type SiteBody = {
  name?: unknown;
  slug?: unknown;
  country?: unknown;
  /** Org tag ids to attach on create (ignored by update — tags have their own route). */
  tagIds?: unknown;
  /** Whether PM auto-mints a per-Site OpenRouter key (replaces the paste field). */
  openrouterMintingEnabled?: unknown;
  /** Monthly spend cap in whole USD for the minted key, or null for no cap. */
  openrouterMonthlyLimitUsd?: unknown;
  /** Per-Site build-timeout override (minutes), or null to use the global. */
  buildTimeoutMin?: unknown;
};

/** Parse the country field: empty / "GLOBAL" → null; else a validated code. */
function parseCountry(raw: string): CountryCode | null | "invalid" {
  if (raw === "" || raw === "GLOBAL") return null;
  return isCountryCode(raw) ? raw : "invalid";
}

export type ParsedSite = {
  name: string;
  slug: string;
  country: CountryCode | null;
  /** Requested org tags (ids), de-duplicated; resolved against the vocabulary on create. */
  tagIds: string[];
  /** Whether PM auto-mints a per-Site OpenRouter key. */
  openrouterMintingEnabled: boolean;
  /** Monthly spend cap in whole USD for the minted key, or null for no cap. */
  openrouterMonthlyLimitUsd: number | null;
  /** Per-Site build-timeout override (minutes), or null to use the global. */
  buildTimeoutMin: number | null;
};

/** Shared field parse + validation for create/update. Returns an error key or the value. */
export function parseSiteBody(
  body: SiteBody,
): { ok: true; value: ParsedSite } | { ok: false; error: SiteErrorKey } {
  const name = String(body.name ?? "").trim();
  const slug = String(body.slug ?? "")
    .trim()
    .toLowerCase();
  const countryRaw = String(body.country ?? "");

  if (!name) return { ok: false, error: "nameRequired" };
  if (!slug) return { ok: false, error: "slugRequired" };
  if (!isValidSlug(slug)) return { ok: false, error: "slugInvalid" };

  const country = parseCountry(countryRaw);
  if (country === "invalid") return { ok: false, error: "countryInvalid" };

  // Key-minting controls (the manual paste field is gone — key is never
  // user-entered). Toggle + monthly USD spend cap.
  const { openrouterMintingEnabled, openrouterMonthlyLimitUsd } =
    parseOpenrouterMinting(body);

  // Per-Site build-timeout override (minutes). Blank/empty/invalid → null (use
  // the global). coerceTimeoutMin clamps to the allowed range; the effective cap
  // at deploy time is max(global, this) — see effectiveBuildTimeoutMin.
  const buildTimeoutMin =
    body.buildTimeoutMin === "" || body.buildTimeoutMin == null
      ? null
      : coerceTimeoutMin(body.buildTimeoutMin);

  return {
    ok: true,
    value: {
      name,
      slug,
      country,
      tagIds: parseTagRefs(body.tagIds),
      openrouterMintingEnabled,
      openrouterMonthlyLimitUsd,
      buildTimeoutMin,
    },
  };
}

/**
 * REST create-Site endpoint (replaces the former server action). Authz +
 * country scope re-enforced server-side. On success returns `{ savedId }`; the
 * client navigates to the Site detail page.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user || !canUserCreateSite(user)) {
    return NextResponse.json({ error: "notAllowed" }, { status: 403 });
  }

  let body: SiteBody;
  try {
    body = (await request.json()) as SiteBody;
  } catch {
    return NextResponse.json({ error: "unknown" }, { status: 400 });
  }

  const parsed = parseSiteBody(body);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }
  const { name, slug, country, tagIds } = parsed.value;

  try {
    // Unknown tag ids are dropped (not rejected): the form's options came from
    // the same vocabulary, so a mismatch only means a tag was deleted meanwhile.
    const result = await createSiteForActor(user, { name, slug, country, tagRefs: tagIds });
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    return NextResponse.json({ savedId: result.site.id });
  } catch {
    return NextResponse.json({ error: "unknown" }, { status: 500 });
  }
}
