/**
 * External-data-source tool handlers (split from `tool-dispatch.ts`): list,
 * create, patch (update_data_source / set_data_source_request), live-test,
 * and guarded deletes. Registered in the shared HANDLERS map in
 * `tool-dispatch.ts`.
 *
 * external-data-sources (Slice 6) + mcp-full-crud-patch (T3): same discipline
 * as the collection tools — pure validation/merging in data-source-tools.ts,
 * store/fetch effects here. Secrets are WRITE-ONLY — a tool may SET one
 * (encrypted via the Worker's CMS_AUTH_SECRET KEK) but no tool result ever
 * contains it. test_data_source mirrors the Slice-4 test endpoint: live
 * fetch, cache BYPASSED, secret injected server-side. Deletes are BLOCKED
 * while referenced (findSiteReferences → describeReferences names every
 * referencing entity; no force flag) and prune the deleted rows' cache-purge
 * counters, mirroring the Admin REST delete routes.
 */
import { getCloudflareContext } from "@opennextjs/cloudflare";
import {
  validateCreateDataSource,
  validateTestDataSource,
  validateUpdateDataSource,
  validateSetDataSourceRequest,
  validateDeleteDataSource,
  validateDeleteDataSourceRequest,
  applySourcePatch,
  applyRequestPatch,
  formatSource,
  formatRequest,
  sampleForModel,
} from "./data-source-tools";
import { coercePageArgs, pagedResult } from "./paging";
import {
  listDataSources,
  createDataSource,
  updateDataSource,
  deleteDataSource,
  createDataSourceRequest,
  updateDataSourceRequest,
  deleteDataSourceRequest,
  listDataSourceRequests,
  decryptSourceSecret,
  type SafeDataSourceRequest,
} from "@/db/data-source-store";
import { pruneApiCacheVersions } from "@/db/settings-store";
import { findSiteReferences } from "@/lib/content/reference-scan-load";
import { describeReferences } from "@/lib/content/reference-scan";
import { fetchSource } from "@/lib/data-sources/fetch";
import { samplePaths } from "@/lib/data-sources/bind";
import type { AuthType, HttpMethod } from "@/lib/data-sources/validate";
import { resolveSource, resolveSourceAndRequest } from "./tool-dispatch-shared";

/** The secret-box KEK from the Worker env ("" when unavailable, e.g. node tests). */
async function kekFromEnv(): Promise<string> {
  try {
    const { env } = await getCloudflareContext({ async: true });
    const e = env as unknown as { CMS_AUTH_SECRET?: string };
    return typeof e.CMS_AUTH_SECRET === "string" ? e.CMS_AUTH_SECRET : "";
  } catch {
    return "";
  }
}

export async function handleListDataSources(args: unknown): Promise<Record<string, unknown>> {
  try {
    // Page the raw source rows first, then fetch saved requests only for the
    // page (not the whole store), and swap the shaped items into the result.
    const res = pagedResult("sources", await listDataSources(), coercePageArgs(args));
    const shaped: Record<string, unknown>[] = [];
    for (const s of res.sources as Awaited<ReturnType<typeof listDataSources>>) {
      shaped.push(formatSource(s, await listDataSourceRequests(s.id)));
    }
    res.sources = shaped;
    return res;
  } catch (err) {
    return { ok: false, errors: [`failed to list data sources: ${(err as Error).message}`] };
  }
}

export async function handleCreateDataSource(args: unknown): Promise<Record<string, unknown>> {
  const valid = validateCreateDataSource(args);
  if (!valid.ok) return { ok: false, errors: [valid.error] };
  try {
    const kek = await kekFromEnv();
    if (valid.value.secret && !kek) {
      return { ok: false, errors: ["cannot store a secret: the site has no CMS_AUTH_SECRET configured"] };
    }
    const source = await createDataSource(valid.value.source, valid.value.secret, kek);
    const requests: SafeDataSourceRequest[] = [];
    for (const r of valid.value.requests) {
      const created = await createDataSourceRequest(source.id, r);
      if (created) requests.push(created);
    }
    // Nest under `source:` — a spread top-level `name` would collide with the
    // dispatcher's tool name (and now be overwritten, losing the source name).
    return { ok: true, action: "created", source: formatSource(source, requests) };
  } catch (err) {
    return { ok: false, errors: [`failed to create data source: ${(err as Error).message}`] };
  }
}

export async function handleUpdateDataSource(args: unknown): Promise<Record<string, unknown>> {
  const valid = validateUpdateDataSource(args);
  if (!valid.ok) return { ok: false, errors: [valid.error] };
  try {
    const resolved = await resolveSource(valid.value.sourceRef);
    if (!resolved.ok) return { ok: false, errors: [resolved.error] };
    const applied = applySourcePatch(resolved.source, valid.value.patch);
    if (!applied.ok) return { ok: false, errors: [applied.error] };
    const kek = await kekFromEnv();
    if (typeof applied.value.secret === "string" && !kek) {
      return { ok: false, errors: ["cannot store a secret: the site has no CMS_AUTH_SECRET configured"] };
    }
    const updated = await updateDataSource(
      resolved.source.id,
      applied.value.source,
      applied.value.secret,
      kek,
    );
    if (!updated) return { ok: false, errors: [`data source "${valid.value.sourceRef}" disappeared while updating — call list_data_sources and retry`] };
    return {
      ok: true,
      action: "updated",
      source: formatSource(updated, await listDataSourceRequests(updated.id)),
    };
  } catch (err) {
    return { ok: false, errors: [`failed to update data source: ${(err as Error).message}`] };
  }
}

export async function handleSetDataSourceRequest(args: unknown): Promise<Record<string, unknown>> {
  const valid = validateSetDataSourceRequest(args);
  if (!valid.ok) return { ok: false, errors: [valid.error] };
  try {
    const resolved = await resolveSource(valid.value.sourceRef);
    if (!resolved.ok) return { ok: false, errors: [resolved.error] };
    const source = resolved.source;
    const requests = await listDataSourceRequests(source.id);
    const ref = valid.value.requestRef;
    const existing = requests.find((r) => r.id === ref) ?? requests.find((r) => r.name === ref);

    const applied = applyRequestPatch(existing ?? null, ref, valid.value.patch);
    if (!applied.ok) return { ok: false, errors: [applied.error] };

    // Patch IN PLACE (never delete+recreate) — the request id must stay stable
    // so existing bindings and chat-agent allowlists keep working.
    const saved = existing
      ? await updateDataSourceRequest(source.id, existing.id, applied.value.request)
      : await createDataSourceRequest(source.id, applied.value.request);
    if (!saved) return { ok: false, errors: [`saved request "${ref}" on source "${source.name}" disappeared while saving — call list_data_sources and retry`] };
    return { ok: true, action: applied.value.action, source: source.name, request: formatRequest(saved) };
  } catch (err) {
    return { ok: false, errors: [`failed to set data source request: ${(err as Error).message}`] };
  }
}

export async function handleDeleteDataSourceRequest(args: unknown): Promise<Record<string, unknown>> {
  const valid = validateDeleteDataSourceRequest(args);
  if (!valid.ok) return { ok: false, errors: [valid.error] };
  try {
    const resolved = await resolveSourceAndRequest(valid.value.sourceRef, valid.value.requestRef);
    if (!resolved.ok) return { ok: false, errors: [resolved.error] };
    const { source, request } = resolved;
    const target = { kind: "dataSourceRequest", sourceId: source.id, requestId: request.id } as const;
    const refs = await findSiteReferences(target);
    if (refs.length > 0) {
      return { ok: false, errors: [describeReferences(target, request.name, refs)] };
    }
    const removed = await deleteDataSourceRequest(source.id, request.id);
    if (!removed) return { ok: false, errors: [`saved request "${request.name}" was already deleted — call list_data_sources to see the current state`] };
    await pruneApiCacheVersions({ requestIds: [request.id] });
    return { ok: true, action: "deleted", source: source.name, request: { id: request.id, name: request.name } };
  } catch (err) {
    return { ok: false, errors: [`failed to delete data source request: ${(err as Error).message}`] };
  }
}

export async function handleDeleteDataSource(args: unknown): Promise<Record<string, unknown>> {
  const valid = validateDeleteDataSource(args);
  if (!valid.ok) return { ok: false, errors: [valid.error] };
  try {
    const resolved = await resolveSource(valid.value.sourceRef);
    if (!resolved.ok) return { ok: false, errors: [resolved.error] };
    const source = resolved.source;
    // A dataSource target also matches references to ANY of its saved requests
    // (they carry the sourceId), so one scan guards the whole cascade.
    const target = { kind: "dataSource", sourceId: source.id } as const;
    const refs = await findSiteReferences(target);
    if (refs.length > 0) {
      return { ok: false, errors: [describeReferences(target, source.name, refs)] };
    }
    // Capture the saved-request ids BEFORE the delete — they cascade with it.
    const requestIds = (await listDataSourceRequests(source.id)).map((r) => r.id);
    const removed = await deleteDataSource(source.id);
    if (!removed) return { ok: false, errors: [`data source "${source.name}" was already deleted — call list_data_sources to see the current state`] };
    await pruneApiCacheVersions({ sourceId: source.id, requestIds });
    return { ok: true, action: "deleted", source: { id: source.id, name: source.name }, deletedRequests: requestIds.length };
  } catch (err) {
    return { ok: false, errors: [`failed to delete data source: ${(err as Error).message}`] };
  }
}

export async function handleTestDataSource(args: unknown): Promise<Record<string, unknown>> {
  const valid = validateTestDataSource(args);
  if (!valid.ok) return { ok: false, errors: [valid.error] };
  try {
    const resolved = await resolveSourceAndRequest(valid.value.source, valid.value.request);
    if (!resolved.ok) return { ok: false, errors: [resolved.error] };
    const { source, request } = resolved;
    const secret = source.hasSecret ? await decryptSourceSecret(source.id, await kekFromEnv()) : null;
    const result = await fetchSource(
      {
        id: source.id,
        baseUrl: source.baseUrl,
        authType: source.authType as AuthType,
        authParam: source.authParam,
        secret,
      },
      {
        id: request.id,
        method: request.method as HttpMethod,
        path: request.path,
        query: request.query,
        bodyTemplate: request.bodyTemplate,
        cacheEnabled: false, // live test — never read/write the render cache
        cacheTtlSec: request.cacheTtlSec,
        retryable: request.retryable,
      },
      valid.value.params,
      { cache: null },
    );
    if (!result.ok) {
      return {
        ok: false,
        errors: [
          `upstream request failed (status ${result.status ?? "none"}): ${result.error}. ` +
            `Check the request's {placeholder} params and the source's auth config.`,
        ],
      };
    }
    // `paths` covers the FULL response; `data` is size-capped for the context.
    return { ok: true, status: result.status, paths: samplePaths(result.data), data: sampleForModel(result.data) };
  } catch (err) {
    return { ok: false, errors: [`failed to test data source: ${(err as Error).message}`] };
  }
}
