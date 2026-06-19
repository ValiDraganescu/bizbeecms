import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getCurrentUser, getUserCountries } from "@/lib/auth/user";
import { canManageSiteByCountry } from "@/lib/site/authz";
import {
  addSiteDomain,
  findSiteById,
  isUserAssignedToSite,
} from "@/lib/site/site";

export type CustomDomainError =
  | "notAllowed"
  | "notFound"
  | "notDeployed"
  | "badRequest"
  | "notConfigured"
  | "deployerUnreachable"
  | "unknown";

export type DnsRecord = { name: string; value: string };
export type CustomDomainResult = {
  ok: true;
  hostname: string;
  status: string;
  ssl: string;
  dns: {
    routing: {
      cname: DnsRecord;
      apexA: { name: string; values: string[] };
    };
    dcv: DnsRecord | null;
    txt: DnsRecord[];
  };
};

// Same conservative hostname shape the deployer enforces — fail early in PM so
// we don't round-trip an obviously bad value.
const HOSTNAME_RE =
  /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

/**
 * Attach a customer custom domain to a deployed Site. Authz mirrors deploy: the
 * actor must MANAGE the Site (country reach OR assignment). Delegates to the
 * deployer's `/attach-domain`, which registers the Cloudflare-for-SaaS custom
 * hostname and records Host->slug for the router. Returns the DNS records the
 * customer must add at their registrar.
 *
 * Requires the Site to be `deployed` — the router proxies the custom hostname to
 * `bizbeecms-cms-<slug>`, which doesn't exist until the Site is live.
 */
export async function POST(
  request: Request,
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

  if (site.status !== "deployed") {
    return NextResponse.json({ error: "notDeployed" }, { status: 409 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    hostname?: unknown;
  };
  const hostname = String(body.hostname ?? "")
    .trim()
    .toLowerCase();
  if (!HOSTNAME_RE.test(hostname)) {
    return NextResponse.json({ error: "badRequest" }, { status: 400 });
  }

  const { env } = await getCloudflareContext({ async: true });
  const bag = env as unknown as Record<string, unknown>;
  const deployerUrl =
    typeof bag.DEPLOYER_URL === "string" ? bag.DEPLOYER_URL : "";
  const deployerSecret =
    typeof bag.DEPLOYER_SECRET === "string" ? bag.DEPLOYER_SECRET : "";
  if (!deployerUrl || !deployerSecret) {
    return NextResponse.json({ error: "notConfigured" }, { status: 500 });
  }

  try {
    const res = await fetch(
      `${deployerUrl.replace(/\/+$/, "")}/attach-domain`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${deployerSecret}`,
        },
        body: JSON.stringify({ slug: site.slug, hostname }),
      },
    );
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok || data.ok !== true) {
      // Surface the deployer's "notConfigured" (missing CF_ZONE_ID/HOST_MAP)
      // distinctly; everything else is an unreachable/upstream failure.
      const upstream = data.error === "notConfigured" ? "notConfigured" : "deployerUnreachable";
      return NextResponse.json({ error: upstream }, { status: 502 });
    }
    // Persist so the Site page can list this domain (and its DNS records) across
    // reloads — the deployer only wrote CF + HOST_MAP, which PM can't query by Site.
    await addSiteDomain(site.id, hostname);
    return NextResponse.json(data as CustomDomainResult);
  } catch {
    return NextResponse.json({ error: "deployerUnreachable" }, { status: 502 });
  }
}
