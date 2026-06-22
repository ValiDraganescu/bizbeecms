import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { findSiteById, setSiteDeployStatus } from "@/lib/site/site";
import {
  buildFailedCallbackEvent,
  insertDeployEvent,
} from "@/lib/deploy/deploy-events";
import { deployedVersionFromCallback } from "@/lib/deploy/cms-version";

type Body = {
  siteId?: unknown;
  status?: unknown;
  workerName?: unknown;
  // The CMS release ref (git tag / branch) the deployer cloned + deployed.
  // Recorded onto the Site so the list/detail can show its CMS version.
  deployedRef?: unknown;
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

  // On failure, persist the deployer's final error + build-log tail as a
  // terminal `failed` deploy_event so the UI can surface it (not just
  // `wrangler tail`). We reuse the existing deploy_events trail rather than
  // adding an `error` column to `sites`: the trail already exists and the read
  // API/UI will render it, so this keeps schema churn at zero. Best-effort — a
  // failed insert must NEVER break the status latch below, so it's try/caught.
  if (status === "failed") {
    const log = (body as { log?: unknown }).log;
    console.error(
      `[deploy-callback] site=${siteId} FAILED: ${String(body.error ?? "(no error)")} | log: ${String(log ?? "(none)")}`,
    );
    try {
      await insertDeployEvent(
        buildFailedCallbackEvent(
          siteId,
          body.error,
          log,
          Date.now(),
          (body as { deployId?: unknown }).deployId,
        ),
      );
    } catch (e) {
      console.error(`[deploy-callback] failed to persist error event: ${String(e)}`);
    }
  }

  const workerName =
    status === "deployed" && typeof body.workerName === "string"
      ? body.workerName
      : undefined;
  // Record the deployed CMS version only on success (the deployer echoes the
  // ref it cloned as `deployedRef`). On `failed` leave it untouched so the last
  // good version survives.
  const deployedCmsVersion =
    status === "deployed"
      ? (deployedVersionFromCallback(body.deployedRef) ?? undefined)
      : undefined;
  await setSiteDeployStatus(
    siteId,
    status,
    workerName ?? undefined,
    deployedCmsVersion,
  );

  return NextResponse.json({ ok: true });
}
