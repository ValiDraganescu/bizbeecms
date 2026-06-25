import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/user";
import manifest from "@/lib/deploy/releases.generated.json";

/**
 * List the deployable CMS releases (cms-releases Slice 5). The list is BAKED IN
 * at build time: `/cms-release` writes `releases.generated.json` (pre-trimmed and
 * sorted newest-first) from `release-notes/*.md`. No deployer call, no git op —
 * the version picker reads this straight from the bundle. Authed with the
 * bizbee_session (any logged-in user); listing released versions is harmless.
 */
export async function GET(): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "notAllowed" }, { status: 403 });

  // Strip the inlined markdown — the picker only needs {version, tag}.
  const releases = manifest.releases.map(({ version, tag }) => ({ version, tag }));
  return NextResponse.json({ releases });
}
