/**
 * A user's own MCP connections (OAuth grants) — list + revoke (pm-mcp Slice 2).
 * Cookie-session authed; every signed-in user manages their own grants.
 *   GET        → ConnectionItem[]
 *   DELETE ?id → { revoked }
 */
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/user";
import { listConnections, revokeConnection } from "@/lib/oauth/store";

export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json(await listConnections(user.id));
}

export async function DELETE(request: Request): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "badRequest" }, { status: 400 });
  return NextResponse.json({ revoked: await revokeConnection(user.id, id) });
}
