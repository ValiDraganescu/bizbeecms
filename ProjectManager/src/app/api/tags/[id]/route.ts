import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/user";
import { deleteTag, isLabelTaken, renameTag } from "@/lib/tags/tags";
import { parseTagLabel } from "@/lib/tags/validate";

function canManageTags(role: string): boolean {
  return role === "SuperAdmin" || role === "Admin";
}

/** PATCH /api/tags/[id] — rename a tag. Body: `{ label }`. Admin+ only. */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user || !canManageTags(user.role)) {
    return NextResponse.json({ error: "notAllowed" }, { status: 403 });
  }
  const { id } = await params;

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
  if (await isLabelTaken(parsed.label, id)) {
    return NextResponse.json({ error: "labelTaken" }, { status: 409 });
  }

  try {
    const tag = await renameTag(id, parsed.label);
    if (!tag) return NextResponse.json({ error: "notFound" }, { status: 404 });
    return NextResponse.json({ tag });
  } catch {
    return NextResponse.json({ error: "labelTaken" }, { status: 409 });
  }
}

/** DELETE /api/tags/[id] — delete a tag (cascades site_tags/user_tags). Admin+ only. */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user || !canManageTags(user.role)) {
    return NextResponse.json({ error: "notAllowed" }, { status: 403 });
  }
  const { id } = await params;
  const ok = await deleteTag(id);
  if (!ok) return NextResponse.json({ error: "notFound" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
