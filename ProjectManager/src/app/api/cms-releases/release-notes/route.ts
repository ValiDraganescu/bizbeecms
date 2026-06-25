import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/user";
import manifest from "@/lib/deploy/releases.generated.json";

/**
 * Serve a CMS release's notes markdown (cms-releases Slice 5). The notes are
 * inlined into `releases.generated.json` at release time (from `release-notes/
 * <ver>.md`), so this reads straight from the bundle — no deployer, no git op.
 * Authed with the bizbee_session. 404 if the version isn't a known release.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "notAllowed" }, { status: 403 });

  const version = new URL(request.url).searchParams.get("version") ?? "";
  if (!/^\d+\.\d+\.\d+$/.test(version)) {
    return NextResponse.json({ error: "badRequest" }, { status: 400 });
  }

  const release = manifest.releases.find((r) => r.version === version);
  if (!release) {
    return NextResponse.json({ error: "notesNotFound" }, { status: 404 });
  }
  return NextResponse.json({ version, markdown: release.markdown });
}
