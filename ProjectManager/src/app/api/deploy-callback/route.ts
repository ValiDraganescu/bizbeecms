import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { findSiteById, setSiteDeployStatus } from "@/lib/site/site";

type Body = {
  siteId?: unknown;
  status?: unknown;
  workerName?: unknown;
  error?: unknown;
};

/**
 * Deploy-status callback from the bizbeecms-deployer Worker. After the container
 * finishes the real CMS build + `wrangler deploy`, the deployer POSTs the
 * outcome here and we move the Site row to `deployed` (with its worker name) or
 * `failed`. Authenticated with the shared DEPLOYER_SECRET — NOT a user session
 * (this is service-to-service).
 */
export async function POST(request: Request): Promise<NextResponse> {
  const { env } = await getCloudflareContext({ async: true });
  const secret = (env as unknown as Record<string, unknown>).DEPLOYER_SECRET;
  const auth = (request.headers.get("authorization") ?? "").replace(
    /^Bearer\s+/i,
    "",
  );
  if (typeof secret !== "string" || !secret || auth !== secret) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "badRequest" }, { status: 400 });
  }

  const siteId = String(body.siteId ?? "");
  const status = String(body.status ?? "");
  if (!siteId || (status !== "deployed" && status !== "failed")) {
    return NextResponse.json({ error: "badRequest" }, { status: 400 });
  }

  const site = await findSiteById(siteId);
  if (!site) {
    return NextResponse.json({ error: "notFound" }, { status: 404 });
  }

  const workerName =
    status === "deployed" && typeof body.workerName === "string"
      ? body.workerName
      : undefined;
  await setSiteDeployStatus(siteId, status, workerName ?? undefined);

  return NextResponse.json({ ok: true });
}
