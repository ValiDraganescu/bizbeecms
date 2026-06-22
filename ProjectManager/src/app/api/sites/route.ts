import { NextResponse } from "next/server";
import { isCountryCode, type CountryCode } from "@/lib/auth/countries";
import { getCurrentUser, getUserCountries } from "@/lib/auth/user";
import { authorizeSiteCountry, canUserCreateSite } from "@/lib/site/authz";
import { createSite, isSlugTaken, isValidSlug } from "@/lib/site/site";
import { parseOpenrouterKey } from "@/lib/site/openrouter-key";

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

export type SiteBody = {
  name?: unknown;
  slug?: unknown;
  country?: unknown;
  /** Plaintext OpenRouter key to set/replace (write-only; blank ≠ clear). */
  openrouterApiKey?: unknown;
  /** Explicit clear — only this wipes an existing key. */
  clearOpenrouterKey?: unknown;
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
  /** Trimmed plaintext to set, or undefined if not provided / blank. */
  openrouterApiKey?: string;
  /** True only when the caller explicitly asked to clear the key. */
  clearOpenrouterKey: boolean;
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

  // Write-only OpenRouter key: a blank field is "no change", NOT a clear. Only
  // the explicit clearOpenrouterKey flag wipes an existing key.
  const { openrouterApiKey, clearOpenrouterKey } = parseOpenrouterKey(body);

  return {
    ok: true,
    value: { name, slug, country, openrouterApiKey, clearOpenrouterKey },
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
  const { name, slug, country } = parsed.value;

  const actorCountries = await getUserCountries(user.id);
  const authzError = authorizeSiteCountry(user, actorCountries, country);
  if (authzError) {
    return NextResponse.json({ error: authzError }, { status: 403 });
  }

  if (await isSlugTaken(slug)) {
    return NextResponse.json({ error: "slugTaken" }, { status: 409 });
  }

  try {
    const site = await createSite({ name, slug, country, createdBy: user.id });
    return NextResponse.json({ savedId: site.id });
  } catch {
    return NextResponse.json({ error: "unknown" }, { status: 500 });
  }
}
