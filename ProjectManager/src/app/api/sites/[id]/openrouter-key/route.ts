import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getCurrentUser, getUserCountries } from "@/lib/auth/user";
import { canManageSiteByCountry } from "@/lib/site/authz";
import {
  findSiteById,
  isUserAssignedToSite,
  clearSiteMintedOpenrouterKey,
} from "@/lib/site/site";
import { deleteKey } from "@/lib/openrouter/provision";

/**
 * DELETE a Site's PM-minted OpenRouter key (KEY-MINTING Slice 5).
 *
 * Revokes the key at OpenRouter (by its stored hash) via the Provisioning API,
 * then clears the Site's `openrouterKeyHash` + `openrouterApiKeyEncrypted`.
 *
 * Proceed-and-clear: if the remote revoke fails (e.g. 404 — the key was already
 * deleted upstream), we STILL clear the local PM state so the Site no longer
 * believes it has a minted key. A re-deploy will then mint a fresh one.
 *
 * Authz mirrors the deploy route: the actor must MANAGE the Site — country-reach
 * OR a `site_users` assignment.
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id: siteId } = await params;

  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "notAllowed" }, { status: 403 });

  const site = await findSiteById(siteId);
  if (!site) return NextResponse.json({ error: "notFound" }, { status: 404 });

  const actorCountries = await getUserCountries(user.id);
  const reachable =
    canManageSiteByCountry(user, actorCountries, site) ||
    (await isUserAssignedToSite(user.id, site.id));
  if (!reachable) {
    return NextResponse.json({ error: "notAllowed" }, { status: 403 });
  }

  // Nothing to delete — already clear.
  if (!site.openrouterKeyHash) {
    return NextResponse.json({ ok: true });
  }

  const { env } = await getCloudflareContext({ async: true });
  const bag = env as unknown as Record<string, unknown>;
  const provKey =
    typeof bag.OPENROUTER_PROVISIONING_KEY === "string"
      ? bag.OPENROUTER_PROVISIONING_KEY
      : "";

  // Revoke upstream, but never let a remote failure block clearing local state.
  try {
    await deleteKey(provKey, site.openrouterKeyHash);
  } catch (e) {
    console.warn(
      `[openrouter-key] Site ${siteId}: remote key revoke failed; clearing ` +
        `local state anyway. ${e instanceof Error ? e.message : ""}`,
    );
  }

  await clearSiteMintedOpenrouterKey(siteId);
  return NextResponse.json({ ok: true });
}
