/**
 * Public guest-chat tool dispatch (Slice 3) — CF-coupled.
 *
 * `runGuestTool` runs ONE guest tool call against the real stores/fetch engine.
 * DELIBERATELY SEPARATE from the admin registry (`lib/chat/tool-dispatch.ts`): a
 * guest can only ever reach the LOCKED-DOWN tools an operator allowlisted on the
 * agent, resolved from the pre-built `GuestToolDef` list — never the admin CRUD
 * tools, which stay unreachable from the public path.
 *
 * Every handler returns `{ ok, … }` and NEVER throws (mirrors the admin handler
 * contract): an unknown tool, a dead reference, or a store error degrades to
 * `{ ok:false, errors:[…] }` so one bad call can't kill the stream. Results are
 * BOUNDED (`sampleForModel`) so a huge API/collection response can't blow the
 * model's context. Failure messages never reveal other items or configuration.
 */
import { getCloudflareContext } from "@opennextjs/cloudflare";
import {
  getDataSource,
  listDataSourceRequests,
  decryptSourceSecret,
} from "@/db/data-source-store";
import { fetchSource } from "@/lib/data-sources/fetch";
import {
  requestPlaceholders,
  type AuthType,
  type HttpMethod,
} from "@/lib/data-sources/validate";
import { queryCollection } from "@/db/query-store";
import { createItem, updateItem } from "@/db/item-store";
import { MAX_SAMPLE_CHARS, sampleForModel } from "@/lib/chat/data-source-tools";
import { apiParamsFromFields, collectionBodyFromFields } from "@/lib/forms/submit-core";
import type { GuestToolDef } from "./guest-tools";
import { GUEST_QUERY_LIMIT_MAX, LOCAL_TIME_TO_UTC_TOOL } from "./guest-tools";
import type {
  ChatAgentConfig,
  DataSourceAllowEntry,
  CollectionAllowEntry,
} from "./core";
import { localTimeToUtc } from "./core";
import { guestQuerySpec, updateLookupFilters, guestBody, missingRequiredParams } from "./dispatch-core";

/**
 * Truncation hint for guest tool results — the guest result carries no `paths`
 * array (unlike the admin tool result the shared default hint refers to), so
 * the self-correction names the one move a guest bot can make.
 */
const GUEST_TRUNCATION_HINT = "repeat the call with narrower filters to see the rest";

/** Everything a guest tool call needs, assembled once per request by the route. */
export interface GuestToolContext {
  config: ChatAgentConfig;
  /** The tools the route built for THIS agent — the name→entry allowlist. */
  tools: GuestToolDef[];
  /** Declared field names per collection table name (for query/create/update). */
  collectionFields: Map<string, string[]>;
  /** Per-conversation call counts, keyed by tool name. MUTATED across calls. */
  callCounts: Map<string, number>;
  /** The secret-box KEK (`CMS_AUTH_SECRET`); "" when unset. */
  kek: string;
  /** The visitor's UTC offset (minutes) — the fallback for `local_time_to_utc`. */
  offsetMinutes: number;
}

/** Every guest tool result is this shape (`ok` + name; error list on failure). */
export type GuestToolResult = { name: string; ok: boolean } & Record<string, unknown>;

function fail(name: string, ...errors: string[]): GuestToolResult {
  return { name, ok: false, errors };
}

/**
 * Run one guest tool call. Resolves the tool by name from the agent's built
 * allowlist, dispatches on its kind, and returns a bounded `{ok,…}` result.
 * Unknown name → `{ok:false}` (never throws).
 */
export async function runGuestTool(
  ctx: GuestToolContext,
  name: string,
  args: unknown,
): Promise<GuestToolResult> {
  const tool = ctx.tools.find((t) => t.name === name);
  if (!tool) return fail(name, "unknown tool");

  try {
    switch (tool.kind) {
      case "builtin":
        return runBuiltin(ctx, name, args);
      case "datasource":
        return await runDataSource(ctx, name, tool.entry as DataSourceAllowEntry, args);
      case "query":
        return await runQuery(ctx, name, tool.entry as CollectionAllowEntry, args);
      case "create":
        return await runCreate(ctx, name, tool.entry as CollectionAllowEntry, args);
      case "update":
        return await runUpdate(ctx, name, tool.entry as CollectionAllowEntry, args);
      default:
        return fail(name, "unknown tool");
    }
  } catch {
    // The handler contract is never-throw; a store/fetch exception degrades to a
    // generic tool error (internals stay server-side, out of the model context).
    return fail(name, "the tool failed — please try again");
  }
}

// ── builtin tools ─────────────────────────────────────────────────────────────

/**
 * Run a builtin tool (currently only `local_time_to_utc`). Pure logic lives in
 * the core (`localTimeToUtc`); the conversation's offset is the fallback when the
 * model passes a bare (offset-less) local time. A self-correcting error on bad
 * input degrades to `{ok:false}` like every other guest tool.
 */
function runBuiltin(ctx: GuestToolContext, name: string, args: unknown): GuestToolResult {
  if (name !== LOCAL_TIME_TO_UTC_TOOL) return fail(name, "unknown tool");
  const rec = args && typeof args === "object" && !Array.isArray(args)
    ? (args as Record<string, unknown>)
    : {};
  const res = localTimeToUtc(rec.local_time, ctx.offsetMinutes);
  if (!res.ok) return fail(name, res.error);
  return { name, ok: true, utc: res.utc };
}

// ── data-source tool ──────────────────────────────────────────────────────────

async function runDataSource(
  ctx: GuestToolContext,
  name: string,
  entry: DataSourceAllowEntry,
  args: unknown,
): Promise<GuestToolResult> {
  // Per-conversation call cap (enforced here, not in the pure schema).
  if (entry.maxCallsPerConversation !== undefined) {
    const used = ctx.callCounts.get(name) ?? 0;
    if (used >= entry.maxCallsPerConversation) {
      return fail(name, "call limit reached for this conversation");
    }
    ctx.callCounts.set(name, used + 1);
  }

  const source = await getDataSource(entry.sourceId);
  const saved = source
    ? (await listDataSourceRequests(entry.sourceId)).find((r) => r.id === entry.requestId)
    : undefined;
  if (!source || !saved) return fail(name, "this tool is no longer available");

  const rec = args && typeof args === "object" && !Array.isArray(args)
    ? (args as Record<string, unknown>)
    : {};
  const fields: Record<string, string> = {};
  for (const [k, v] of Object.entries(rec)) {
    if (typeof v === "string") fields[k] = v;
    else if (typeof v === "number" || typeof v === "boolean") fields[k] = String(v);
  }
  // Operator-required params refuse "" — the "" convention is for params the
  // operator left optional, never for these.
  const missing = missingRequiredParams(entry.requiredParams, fields);
  if (missing.length > 0) {
    return fail(
      name,
      `these parameters are required and cannot be empty: ${missing.join(", ")} — call again with real values for them`,
    );
  }
  const params = apiParamsFromFields(
    requestPlaceholders({ path: saved.path, query: saved.query, bodyTemplate: saved.bodyTemplate }),
    fields,
  );
  if (!params.ok) return fail(name, params.error);

  const secret = source.hasSecret ? await decryptSourceSecret(source.id, ctx.kek) : null;
  const isGet = saved.method === "GET";
  const result = await fetchSource(
    {
      id: source.id,
      baseUrl: source.baseUrl,
      authType: source.authType as AuthType,
      authParam: source.authParam,
      secret,
    },
    {
      id: saved.id,
      method: saved.method as HttpMethod,
      path: saved.path,
      query: saved.query,
      bodyTemplate: saved.bodyTemplate,
      // Cache respected for reads; a mutating call must fire once + never retry.
      cacheEnabled: isGet ? saved.cacheEnabled : false,
      cacheTtlSec: saved.cacheTtlSec,
      retryable: false,
    },
    params.params,
    { cache: null },
  );
  // Surface the engine's error (upstream status + capped body excerpt) so the
  // model can self-correct — a masked "could not be completed" leaves it blind.
  if (!result.ok) return fail(name, `the request could not be completed (${result.error})`);
  return { name, ok: true, data: sampleForModel(result.data, MAX_SAMPLE_CHARS, GUEST_TRUNCATION_HINT) };
}

// ── query tool ────────────────────────────────────────────────────────────────

async function runQuery(
  ctx: GuestToolContext,
  name: string,
  entry: CollectionAllowEntry,
  args: unknown,
): Promise<GuestToolResult> {
  const declared = ctx.collectionFields.get(entry.collection) ?? [];
  const spec = guestQuerySpec(args, declared, GUEST_QUERY_LIMIT_MAX);
  const res = await queryCollection(entry.collection, spec);
  if (!res.ok) return fail(name, "the query could not be completed");
  return {
    name,
    ok: true,
    items: sampleForModel(res.plan.items, MAX_SAMPLE_CHARS, GUEST_TRUNCATION_HINT),
    total: res.plan.total,
  };
}

// ── create tool ───────────────────────────────────────────────────────────────

async function runCreate(
  ctx: GuestToolContext,
  name: string,
  entry: CollectionAllowEntry,
  args: unknown,
): Promise<GuestToolResult> {
  const declared = ctx.collectionFields.get(entry.collection) ?? [];
  // Keep only declared fields, then force status:"draft" (operator reviews).
  const body = collectionBodyFromFields(guestBody(args, declared), declared);
  const res = await createItem(entry.collection, body);
  if (!res.ok) return fail(name, res.error);
  const id = typeof res.plan.id === "string" ? res.plan.id : String(res.plan.id ?? "");
  return { name, ok: true, id };
}

// ── update tool ───────────────────────────────────────────────────────────────

async function runUpdate(
  ctx: GuestToolContext,
  name: string,
  entry: CollectionAllowEntry,
  args: unknown,
): Promise<GuestToolResult> {
  const lookupFields = entry.lookupFields ?? [];
  const lookup = updateLookupFilters(args, lookupFields);
  if (!lookup.ok) return fail(name, lookup.error);

  // Exact-match on ALL lookup fields, any non-archived status. The guest never
  // learns about other items: 0 or >1 matches → the same generic "no match".
  const found = await queryCollection(entry.collection, {
    filters: lookup.filters,
    archived: "live",
    limit: 2, // enough to detect ambiguity without leaking the full set
  });
  if (!found.ok) return fail(name, "no matching item found — check the lookup values");
  const rows = found.plan.items;
  if (rows.length !== 1) {
    return fail(name, "no matching item found — check the lookup values");
  }
  const id = rows[0].id;
  if (typeof id !== "string") return fail(name, "no matching item found — check the lookup values");

  const declared = ctx.collectionFields.get(entry.collection) ?? [];
  // Declared non-lookup fields only; status forced to draft for operator review.
  const patch = guestBody(args, declared, lookupFields);
  patch.status = "draft";
  const res = await updateItem(entry.collection, id, patch);
  if (!res.ok) return fail(name, res.error);
  return { name, ok: true, id };
}

/**
 * Best-effort KEK read (`CMS_AUTH_SECRET`) for the data-source secret decrypt,
 * same shape the form route uses. "" when unbound (local dev / no secret).
 */
export async function guestKek(): Promise<string> {
  const { env } = await getCloudflareContext({ async: true });
  const e = env as unknown as Record<string, unknown>;
  return typeof e.CMS_AUTH_SECRET === "string" ? e.CMS_AUTH_SECRET : "";
}
