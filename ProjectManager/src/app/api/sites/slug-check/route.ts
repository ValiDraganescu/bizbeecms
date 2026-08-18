import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/user";
import { isSlugTaken } from "@/lib/site/site";
import { isValidSlug } from "@/lib/site/slug";

/**
 * Live slug-availability probe for the Site form (debounced from the client):
 *   GET /api/sites/slug-check?slug=<slug>[&exclude=<siteId>]
 * → { slug, valid, available }
 *
 * `exclude` = the Site being edited, so its own slug reads as available.
 * Purely advisory — the create/update routes re-check `isSlugTaken` on write
 * (unique index on sites.slug is the real guarantee), so a race here can only
 * produce a late 409, never a duplicate. Any signed-in user may probe: slugs
 * are already visible in the Sites list + URLs, so this leaks nothing.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "notAllowed" }, { status: 403 });

  const url = new URL(request.url);
  const slug = (url.searchParams.get("slug") ?? "").trim().toLowerCase();
  const exclude = url.searchParams.get("exclude") ?? undefined;
  const valid = isValidSlug(slug);
  const available = valid ? !(await isSlugTaken(slug, exclude)) : false;
  return NextResponse.json({ slug, valid, available });
}
