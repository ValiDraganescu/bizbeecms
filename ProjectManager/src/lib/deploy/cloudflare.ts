import { getCloudflareContext } from "@opennextjs/cloudflare";
import {
  buildScriptUploadForm,
  type WorkerScriptUpload,
} from "./script-upload";

// Re-export the pure builder + type so existing import sites (cloudflare.ts as
// the single deploy-client entry) keep working.
export { buildScriptUploadForm };
export type { WorkerScriptUpload };

/**
 * Minimal Cloudflare REST API client for provisioning per-Site CMS Workers.
 *
 * The PM, once deployed to Cloudflare, must be able to trigger a CMS deploy via
 * the Cloudflare API (the milestone's hardest acceptance criterion). This module
 * builds and issues those API calls. It is server-only (reads secrets from the
 * Worker env) and uses the global `fetch` — which works from a Worker thanks to
 * the `global_fetch_strictly_public` compat flag.
 *
 * Credentials come from the Worker env (set as wrangler secrets / vars, NEVER
 * committed):
 *   - CF_API_TOKEN     — an API token scoped to "Workers Scripts: Edit".
 *   - CF_ACCOUNT_ID    — the Cloudflare account id that owns the Workers.
 * Without both, the client reports `notConfigured` so callers can degrade
 * gracefully instead of throwing. (There is no Cloudflare auth in dev/CI, so the
 * request-building is unit/build-verifiable but a live call only runs once the
 * secrets are present on the deployed PM.)
 */

const CF_API_BASE = "https://api.cloudflare.com/client/v4";

export type CloudflareCreds = {
  apiToken: string;
  accountId: string;
};

/**
 * Read Cloudflare API credentials from the Worker env. Returns null when either
 * is missing — the deploy layer treats that as `notConfigured` (a graceful,
 * expected state in any environment without CF secrets).
 *
 * Note: these are NOT in cloudflare-env.d.ts (secrets aren't typed by
 * `wrangler types`), so we read them off the env defensively as unknown.
 */
export async function getCloudflareCreds(): Promise<CloudflareCreds | null> {
  const { env } = await getCloudflareContext({ async: true });
  const bag = env as unknown as Record<string, unknown>;
  const apiToken = typeof bag.CF_API_TOKEN === "string" ? bag.CF_API_TOKEN : "";
  const accountId =
    typeof bag.CF_ACCOUNT_ID === "string" ? bag.CF_ACCOUNT_ID : "";
  if (!apiToken || !accountId) return null;
  return { apiToken, accountId };
}

export type CfApiError = {
  ok: false;
  /** Stable, locale-agnostic reason key for the caller / UI. */
  reason: "notConfigured" | "httpError" | "networkError";
  /** Human-readable detail for logs (never shown raw to users). */
  detail: string;
  /** Cloudflare's error messages, when the API returned a structured error. */
  errors?: string[];
};

export type CfApiSuccess<T> = { ok: true; result: T };
export type CfApiResult<T> = CfApiSuccess<T> | CfApiError;

/** Shape of Cloudflare's envelope: `{ success, errors, messages, result }`. */
type CfEnvelope<T> = {
  success: boolean;
  errors?: Array<{ code?: number; message?: string }>;
  result?: T;
};

/**
 * Upload (create or replace) a Worker script under the account. This is the
 * actual provisioning call: `PUT /accounts/{account}/workers/scripts/{name}`.
 * Returns a structured result; never throws for an API/network error.
 */
export async function uploadWorkerScript(
  upload: WorkerScriptUpload,
): Promise<CfApiResult<{ scriptName: string }>> {
  const creds = await getCloudflareCreds();
  if (!creds) {
    return {
      ok: false,
      reason: "notConfigured",
      detail: "CF_API_TOKEN and CF_ACCOUNT_ID are not set on this environment.",
    };
  }

  const url = `${CF_API_BASE}/accounts/${creds.accountId}/workers/scripts/${upload.scriptName}`;
  const form = buildScriptUploadForm(upload);

  let res: Response;
  try {
    res = await fetch(url, {
      method: "PUT",
      headers: { authorization: `Bearer ${creds.apiToken}` },
      body: form,
    });
  } catch (err) {
    return {
      ok: false,
      reason: "networkError",
      detail: err instanceof Error ? err.message : String(err),
    };
  }

  let envelope: CfEnvelope<unknown> | null = null;
  try {
    envelope = (await res.json()) as CfEnvelope<unknown>;
  } catch {
    // Non-JSON body (e.g. a gateway error page).
  }

  if (!res.ok || !envelope?.success) {
    return {
      ok: false,
      reason: "httpError",
      detail: `Cloudflare API returned ${res.status}`,
      errors: envelope?.errors?.map(
        (e) => e.message ?? `code ${e.code ?? "?"}`,
      ),
    };
  }

  return { ok: true, result: { scriptName: upload.scriptName } };
}

/** Re-exported for callers that want the base URL (tests / diagnostics). */
export { CF_API_BASE };
