import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getCurrentUser, getUserCountries } from "@/lib/auth/user";
import { authorizeSiteCountry, canManageSiteByCountry, canUserCreateSite } from "@/lib/site/authz";
import {
  findSiteById,
  isSlugTaken,
  setSiteOpenrouterKey,
  updateSite,
} from "@/lib/site/site";
import { encryptSecret } from "@/lib/crypto/secret-box";
import { parseSiteBody, type SiteBody } from "../route";

/**
 * REST update-Site endpoint (replaces the former server action). The actor must
 * be able to create Sites AND reach this Site by country; the new country must
 * be within their scope. On success returns `{ savedId }`.
 */
export async function PATCH(
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
  const { name, slug, country, openrouterApiKey, clearOpenrouterKey } =
    parsed.value;

  const authzError = authorizeSiteCountry(user, actorCountries, country);
  if (authzError) {
    return NextResponse.json({ error: authzError }, { status: 403 });
  }

  if (await isSlugTaken(slug, siteId)) {
    return NextResponse.json({ error: "slugTaken" }, { status: 409 });
  }

  try {
    await updateSite(siteId, { name, slug, country });

    // Write-only OpenRouter key. Clear wins; a blank field is left untouched.
    if (clearOpenrouterKey) {
      await setSiteOpenrouterKey(siteId, null);
    } else if (openrouterApiKey) {
      const { env } = await getCloudflareContext({ async: true });
      const kek = (env as unknown as Record<string, unknown>).SITE_SECRET_KEY;
      if (typeof kek !== "string" || kek === "") {
        return NextResponse.json({ error: "unknown" }, { status: 500 });
      }
      const ciphertext = await encryptSecret(openrouterApiKey, kek);
      await setSiteOpenrouterKey(siteId, ciphertext);
    }

    return NextResponse.json({ savedId: siteId });
  } catch {
    return NextResponse.json({ error: "unknown" }, { status: 500 });
  }
}
