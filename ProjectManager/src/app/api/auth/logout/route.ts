import { NextResponse } from "next/server";
import { destroySession } from "@/lib/auth/session";

/**
 * REST logout endpoint (replaces the former server action). Clears the KV
 * session record + cookie and returns `{ ok: true }`; the client redirects to
 * /login.
 */
export async function POST(): Promise<NextResponse> {
  await destroySession();
  return NextResponse.json({ ok: true });
}
