import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getCurrentUser } from "@/lib/auth/user";

/**
 * Proxy the deployer's `GET /release-notes?version=x.y.z` (cms-releases Slice 5).
 * Returns `{version, markdown}` for the in-app notes viewer. Authed with the
 * bizbee_session; the DEPLOYER_SECRET never leaves the server. The version is
 * validated as a bare semver before we forward it (the deployer validates again).
 */
export async function GET(request: Request): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "notAllowed" }, { status: 403 });

  const version = new URL(request.url).searchParams.get("version") ?? "";
  if (!/^\d+\.\d+\.\d+$/.test(version)) {
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
      `${deployerUrl.replace(/\/+$/, "")}/release-notes?version=${encodeURIComponent(version)}`,
      { headers: { authorization: `Bearer ${deployerSecret}` } },
    );
    if (res.status === 404) {
      return NextResponse.json({ error: "notesNotFound" }, { status: 404 });
    }
    if (!res.ok) {
      return NextResponse.json({ error: "deployerUnreachable" }, { status: 502 });
    }
    const payload = (await res.json().catch(() => ({}))) as {
      version?: string;
      markdown?: string;
    };
    return NextResponse.json({
      version: payload.version ?? version,
      markdown: typeof payload.markdown === "string" ? payload.markdown : "",
    });
  } catch {
    return NextResponse.json({ error: "deployerUnreachable" }, { status: 502 });
  }
}
