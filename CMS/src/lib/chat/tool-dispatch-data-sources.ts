/**
 * External-data-source tool handlers (split from `tool-dispatch.ts`): list,
 * create, and live-test API data sources. Registered in the shared HANDLERS
 * map in `tool-dispatch.ts`.
 *
 * external-data-sources (Slice 6): same discipline as the collection tools —
 * pure validation in data-source-tools.ts, store/fetch effects here. Secrets
 * are WRITE-ONLY — a tool may SET one (encrypted via the Worker's
 * CMS_AUTH_SECRET KEK) but no tool result ever contains it. test_data_source
 * mirrors the Slice-4 test endpoint: live fetch, cache BYPASSED, secret
 * injected server-side.
 */
import { getCloudflareContext } from "@opennextjs/cloudflare";
import {
  validateCreateDataSource,
  validateTestDataSource,
  formatSource,
  sampleForModel,
} from "./data-source-tools";
import { coercePageArgs, pagedResult } from "./paging";
import {
  listDataSources,
  createDataSource,
  createDataSourceRequest,
  listDataSourceRequests,
  decryptSourceSecret,
  type SafeDataSourceRequest,
} from "@/db/data-source-store";
import { fetchSource } from "@/lib/data-sources/fetch";
import { samplePaths } from "@/lib/data-sources/bind";
import type { AuthType, HttpMethod } from "@/lib/data-sources/validate";
import { resolveSourceAndRequest } from "./tool-dispatch-shared";

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
