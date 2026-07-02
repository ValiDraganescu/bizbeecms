/**
 * Inline data-sources context for the AI assistant.
 *
 * Sibling channel to `page-context.ts` / `component-context.ts` /
 * `collection-context.ts`, for the Data Sources admin: /admin/data-sources
 * publishes the configured sources + their saved requests so the assistant can
 * answer/act without a list_data_sources discovery round-trip.
 *
 * SECURITY: the input shape carries names, auth KIND, and request
 * method/path/placeholders/cache ONLY — no secret, hasSecret, authParam, or
 * baseUrl fields exist on it, so a secret can never leak into the prompt.
 *
 * `formatDataSourcesContext` is the PURE bit (the only logic worth testing).
 */

// Relative (not @/) imports so this stays node-testable like its pure peers.
import { requestPlaceholders } from "../data-sources/validate.ts";

export interface DataSourceRequestInfo {
  name: string;
  method: string;
  path: string;
  query: Record<string, string>;
  bodyTemplate: string | null;
  cacheEnabled: boolean;
  cacheTtlSec: number;
}

export interface DataSourceInfo {
  /** Display name, e.g. "Weather API" — the tools resolve sources by name. */
  name: string;
  /** Auth KIND only (header/query/basic/oauth2/none) — never the param or secret. */
  authType: string;
  requests: DataSourceRequestInfo[];
}

export interface DataSourcesContextInput {
  sources: DataSourceInfo[];
}

// Keep the block compact: overflow is summarized, the model can always call
// list_data_sources for the full picture.
export const MAX_CONTEXT_SOURCES = 10;
export const MAX_CONTEXT_REQUESTS = 8;

/** One saved request as a compact single line. */
function requestLine(r: DataSourceRequestInfo): string {
  const params = requestPlaceholders(r);
  const paramsPart =
    params.length > 0 ? ` — params: ${params.map((p) => `{${p}}`).join(", ")}` : "";
  const cachePart = r.cacheEnabled ? `; cache ${r.cacheTtlSec}s` : "; cache off";
  return `  - "${r.name}": ${r.method} ${r.path || "/"}${paramsPart}${cachePart}`;
}

/**
 * The inline context block prepended to the next user message. Returns "" when
 * there are no sources (nothing worth telling the model).
 */
export function formatDataSourcesContext(
  c: DataSourcesContextInput | null | undefined,
): string {
  if (!c || c.sources.length === 0) return "";

  const lines: string[] = [];
  for (const s of c.sources.slice(0, MAX_CONTEXT_SOURCES)) {
    lines.push(`- "${s.name}" (auth: ${s.authType})`);
    if (s.requests.length === 0) {
      lines.push("  (no saved requests)");
      continue;
    }
    for (const r of s.requests.slice(0, MAX_CONTEXT_REQUESTS)) lines.push(requestLine(r));
    const moreReqs = s.requests.length - MAX_CONTEXT_REQUESTS;
    if (moreReqs > 0) lines.push(`  …and ${moreReqs} more requests`);
  }
  const moreSources = c.sources.length - MAX_CONTEXT_SOURCES;
  if (moreSources > 0) lines.push(`…and ${moreSources} more sources`);

  return (
    `[Data sources context] External data sources in this site ` +
    `(saved requests as "name": METHOD path):\n${lines.join("\n")}\n` +
    `Use these source/request names directly with the data-source tools ` +
    `(test_data_source, bind_component, create_list, bind_form) — do NOT call ` +
    `list_data_sources to rediscover them. Call get_data_sources_guide for the ` +
    `full workflow.`
  );
}

// Module-level latest value + subscribers — same pattern as its sibling stores.
let active = "";
const listeners = new Set<() => void>();

/** Publish the current data-sources context (or clear it with null). */
export function setActiveDataSourcesContext(
  c: DataSourcesContextInput | null | undefined,
): void {
  const next = formatDataSourcesContext(c);
  if (next === active) return;
  active = next;
  for (const fn of listeners) fn();
}

/** The latest published context block, or "" when nothing is set. */
export function getActiveDataSourcesContext(): string {
  return active;
}

/** Subscribe to context changes (for `useSyncExternalStore`). */
export function subscribeActiveDataSourcesContext(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
