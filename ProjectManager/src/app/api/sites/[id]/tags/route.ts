import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/user";
import { canUserCreateSite } from "@/lib/site/authz";
import { findSiteById, setSiteTags } from "@/lib/site/site";
import { listTags } from "@/lib/tags/tags";

type Body = { tagIds?: unknown };

/**
 * REST set-Site-tags endpoint. Replaces the Site's full tag set. Admin+ only
 * (same tier as tag management / Site create — tags are an org-admin concern).
 * Only ids in the managed `tags` vocabulary are accepted (re-enforced here).
 * On success returns `{ saved: true }`.
 */
export async function PUT(
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

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "unknown" }, { status: 400 });
  }

  const requested = new Set(
    Array.isArray(body.tagIds) ? body.tagIds.map(String) : [],
  );
  const tags = await listTags();
  const tagIds = tags.filter((tag) => requested.has(tag.id)).map((tag) => tag.id);

  try {
    await setSiteTags(siteId, tagIds);
    return NextResponse.json({ saved: true });
  } catch {
    return NextResponse.json({ error: "unknown" }, { status: 500 });
  }
}
