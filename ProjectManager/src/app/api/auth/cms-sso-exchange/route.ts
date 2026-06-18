import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { SSO_NONCE_PREFIX } from "@/lib/auth/cms-sso";

/**
 * CMS SSO exchange (cross-host auth bridge). Called server-to-server by the CMS
 * callback (NOT the browser), gated by the shared `CMS_AUTH_SECRET` bearer — the
 * same secret guarding cms-validate. Trades a one-time nonce for the session id
 * it stands for, then DELETES the nonce so it can't be replayed.
 *
 * Body: `{ nonce }`. Returns `{ ok: true, sid }` on a live nonce, else 200
 * `{ ok: false }` (expired/used/unknown) — fail-closed, never leak why.
 */
type Body = { nonce?: unknown };

export async function POST(request: Request): Promise<NextResponse> {
  const { env } = await getCloudflareContext({ async: true });
  const secret = (env as unknown as Record<string, unknown>).CMS_AUTH_SECRET;
  const auth = (request.headers.get("authorization") ?? "").replace(
    /^Bearer\s+/i,
    "",
  );
  if (typeof secret !== "string" || !secret || auth !== secret) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: "badRequest" }, { status: 400 });
  }
  const nonce = typeof body.nonce === "string" ? body.nonce : "";
  if (!nonce) {
    return NextResponse.json({ ok: false, error: "badRequest" }, { status: 400 });
  }

  const key = SSO_NONCE_PREFIX + nonce;
  const raw = await env.SESSIONS.get(key);
  if (!raw) {
    return NextResponse.json({ ok: false }, { status: 200 });
  }
  // Single-use: delete on first read so a replay (from logs/history) finds nothing.
  await env.SESSIONS.delete(key);

  let sid = "";
  try {
    sid = (JSON.parse(raw) as { sid?: unknown }).sid as string;
  } catch {
    return NextResponse.json({ ok: false }, { status: 200 });
  }
  if (typeof sid !== "string" || !sid) {
    return NextResponse.json({ ok: false }, { status: 200 });
  }

  return NextResponse.json({ ok: true, sid }, { status: 200 });
}
