import { NextResponse } from "next/server";
import { getCurrentUser, getUserCountries } from "@/lib/auth/user";
import { canManageSiteByCountry } from "@/lib/site/authz";
import { findSiteById, isUserAssignedToSite } from "@/lib/site/site";
import { canStartDeploy } from "@/lib/deploy";
import { dispatchSiteDeploy } from "@/lib/deploy/dispatch";

// The union lives in the dispatch lib (shared with the rollout runner); the
// re-export keeps this route the import path the client form uses. The i18n
// parity test (scripts/deploy-i18n-parity.test.mjs) reads the union from the
// lib file.
export type { DeployError } from "@/lib/deploy/dispatch";

/**
 * Trigger a CMS deploy for a Site (async fire-and-poll). Authz: the actor must
 * MANAGE the Site — country-reach OR a `site_users` assignment.
 *
 * The actual build runs in the bizbeecms-deployer Worker's container (real
 * `opennextjs-cloudflare build` + `wrangler deploy`, the same path that deploys
 * the PM). `dispatchSiteDeploy` latches the Site to `deploying`, POSTs the job
 * to the deployer, and returns immediately; the deployer calls
 * `/api/deploy-callback` when done to set `deployed`/`failed`. The page
 * reflects status on refresh.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id: siteId } = await params;

  // Optional chosen CMS release ref (a tagged release, picked in Slice 5's
  // version picker). Absent → the deployer defaults to `main`. Validated against
  // the same charset the deployer accepts so we never forward junk.
  let ref: string | undefined;
  try {
    const parsed = (await request.json()) as { ref?: unknown };
    if (typeof parsed?.ref === "string" && /^[\w.\-/]+$/.test(parsed.ref)) {
      ref = parsed.ref;
    }
  } catch {
    // No/invalid JSON body — fine, deploy with the default ref.
  }

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

  if (!canStartDeploy(site)) {
    return NextResponse.json({ error: "alreadyDeploying" }, { status: 409 });
  }

  const result = await dispatchSiteDeploy(site, ref);
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error },
      { status: result.error === "notConfigured" ? 500 : 502 },
    );
  }

  // Accepted — the deploy is running in the container; status finalizes via the
  // callback. Client shows "deploying" and polls. Both warnings are non-blocking:
  // `mintWarning` — minting failed, deploy used the deployer's global key.
  // `keyWarning` — a stored per-Site key couldn't be decrypted (bad/rotated
  // SITE_SECRET_KEY or a corrupt blob), so the deploy fell back to the global key.
  return NextResponse.json({
    accepted: true,
    ...(result.mintWarning ? { mintWarning: true } : {}),
    ...(result.keyWarning ? { keyWarning: true } : {}),
  });
}
