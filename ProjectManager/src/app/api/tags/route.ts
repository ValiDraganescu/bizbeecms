import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/user";
import { canUserCreateSite } from "@/lib/site/authz";
import {
  createTag,
  isLabelTaken,
  listTags,
} from "@/lib/tags/tags";
import { parseTagLabel, type TagValidationError } from "@/lib/tags/validate";

export type TagErrorKey = TagValidationError | "notAllowed" | "labelTaken" | "unknown";

/** Tag management is gated to Admin+ (SuperAdmin / Admin) — same tier as Site create. */
function canManageTags(role: string): boolean {
  return role === "SuperAdmin" || role === "Admin";
}

/** GET /api/tags — list the managed tag vocabulary. Admin+ only. */
export async function GET(): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user || !canUserCreateSite(user)) {
    return NextResponse.json({ error: "notAllowed" }, { status: 403 });
  }
  return NextResponse.json({ tags: await listTags() });
}

/** POST /api/tags — create a tag. Body: `{ label }`. Admin+ only. */
export async function POST(request: Request): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user || !canManageTags(user.role)) {
    return NextResponse.json({ error: "notAllowed" }, { status: 403 });
  }

  let body: { label?: unknown };
  try {
    body = (await request.json()) as { label?: unknown };
  } catch {
    return NextResponse.json({ error: "unknown" }, { status: 400 });
  }

  const parsed = parseTagLabel(body.label);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }
  if (await isLabelTaken(parsed.label)) {
    return NextResponse.json({ error: "labelTaken" }, { status: 409 });
  }

  try {
    const tag = await createTag(parsed.label);
    return NextResponse.json({ tag });
  } catch {
    // The unique index is the last-line guard against a race; surface as 409.
    return NextResponse.json({ error: "labelTaken" }, { status: 409 });
  }
}
