import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getCurrentUser } from "@/lib/auth/user";
import { normalizeReleases } from "@/lib/deploy/cms-releases";

/**
 * Proxy the deployer's `GET /tags` (cms-releases Slice 5). The version picker on
 * the deploy form calls THIS route — never the deployer directly — so the
 * DEPLOYER_SECRET stays server-side. Authed with the bizbee_session (any logged-in
 * user); listing released versions is harmless. Returns the normalised, newest-
 * first `cms-v*` release list.
 */
export async function GET(): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "notAllowed" }, { status: 403 });

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
    const res = await fetch(`${deployerUrl.replace(/\/+$/, "")}/tags`, {
      headers: { authorization: `Bearer ${deployerSecret}` },
    });
    if (!res.ok) {
      return NextResponse.json({ error: "deployerUnreachable" }, { status: 502 });
    }
    const payload = await res.json().catch(() => ({}));
    return NextResponse.json({ releases: normalizeReleases(payload) });
  } catch {
    return NextResponse.json({ error: "deployerUnreachable" }, { status: 502 });
  }
}
