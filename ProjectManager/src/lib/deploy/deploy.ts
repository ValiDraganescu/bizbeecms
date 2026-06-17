import type { Site, SiteStatus } from "@/db/schema";
import { findSiteById, setSiteDeployStatus } from "@/lib/site/site";
import { uploadWorkerScript, type WorkerScriptUpload } from "./cloudflare";
import { workerNameForSlug } from "./worker-name";

/**
 * Site deploy orchestration — the status state-machine.
 *
 * A Site moves: draft → deploying → (deployed | failed). `deploying` is the
 * in-flight latch (set BEFORE the API call so concurrent triggers see it and a
 * crash mid-deploy leaves an honest "deploying" the operator can retry). On
 * success we record `deployed` plus the provisioned Worker name; on any failure
 * (incl. CF not configured) we record `failed` and surface a reason key.
 *
 * The CMS bundle to upload is the plain default install in `CMS/`; producing
 * that bundle (running OpenNext over CMS/ and reading `.open-next/worker.js`)
 * is the *next* slice. This layer takes the bundle as input so the state-machine
 * and the Cloudflare client are independently testable, and so the bundle source
 * (build-on-demand vs. a pre-bundled artifact) can be decided later without
 * touching the orchestration.
 */

/** Statuses from which a deploy may be (re)started. */
const DEPLOYABLE_FROM: SiteStatus[] = ["draft", "deployed", "failed"];

export type DeployErrorKey =
  | "notFound"
  | "alreadyDeploying"
  | "notConfigured"
  | "uploadFailed"
  | "unknown";

export type DeployResult =
  | { ok: true; site: Site }
  | { ok: false; reason: DeployErrorKey; detail?: string };

/** Whether a Site is in a state a deploy can start from. */
export function canStartDeploy(site: Pick<Site, "status">): boolean {
  return DEPLOYABLE_FROM.includes(site.status);
}

export type DeploySiteInput = {
  siteId: string;
  /**
   * The built CMS Worker bundle to upload. Omit only in tests; when omitted the
   * deploy short-circuits to `notConfigured`-style failure rather than guessing.
   */
  bundle: Pick<WorkerScriptUpload, "mainModule" | "files">;
};

/**
 * Run a deploy for a Site through the full state-machine. Idempotent guards:
 * refuses if the Site is already `deploying`. On every exit path the Site row's
 * status reflects reality.
 */
export async function deploySite(input: DeploySiteInput): Promise<DeployResult> {
  const site = await findSiteById(input.siteId);
  if (!site) return { ok: false, reason: "notFound" };

  if (site.status === "deploying") {
    return { ok: false, reason: "alreadyDeploying" };
  }
  if (!canStartDeploy(site)) {
    return { ok: false, reason: "unknown" };
  }

  const workerName = workerNameForSlug(site.slug);

  // Latch to `deploying` before the network call.
  await setSiteDeployStatus(site.id, "deploying");

  const upload: WorkerScriptUpload = {
    scriptName: workerName,
    mainModule: input.bundle.mainModule,
    files: input.bundle.files,
  };

  const result = await uploadWorkerScript(upload);

  if (!result.ok) {
    await setSiteDeployStatus(site.id, "failed");
    const reason: DeployErrorKey =
      result.reason === "notConfigured" ? "notConfigured" : "uploadFailed";
    return {
      ok: false,
      reason,
      detail: [result.detail, ...(result.errors ?? [])]
        .filter(Boolean)
        .join("; "),
    };
  }

  const updated = await setSiteDeployStatus(site.id, "deployed", workerName);
  if (!updated) return { ok: false, reason: "notFound" };
  return { ok: true, site: updated };
}
