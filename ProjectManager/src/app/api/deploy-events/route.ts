import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { isAuthorized, parseDeployEvent, insertDeployEvent } from "@/lib/deploy/deploy-events";

/**
 * Per-step deploy-event ingest from the bizbeecms-deployer Worker's detached
 * build script (deploy-audit-trail subgoal). The script POSTs one event at the
 * start and end of each deploy step; we persist it to the `deploy_events` trail.
 * Authenticated with the shared DEPLOYER_SECRET — NOT a user session (this is
 * service-to-service, mirrors deploy-callback/route.ts). Best-effort on the
 * caller's side: an emit failure must never break the deploy.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const { env } = await getCloudflareContext({ async: true });
  const secret = (env as unknown as Record<string, unknown>).DEPLOYER_SECRET;
  const auth = (request.headers.get("authorization") ?? "").replace(
    /^Bearer\s+/i,
    "",
  );
  if (!isAuthorized(secret, auth)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "badRequest" }, { status: 400 });
  }

  const parsed = parseDeployEvent(body);
  if (!parsed.ok) {
    return NextResponse.json({ error: "badRequest", reason: parsed.reason }, { status: 400 });
  }

  await insertDeployEvent(parsed.event);
  return NextResponse.json({ ok: true });
}
