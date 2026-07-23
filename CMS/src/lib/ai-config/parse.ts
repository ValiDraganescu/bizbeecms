/**
 * Pure validation for the curated AI config — no I/O, no deps (tested in
 * parse.test.ts). Two boundaries feed it, both untrusted:
 *
 *   - the PM response body (Contract A in docs/ai-cost-quotas-contracts.md),
 *   - the `ai_config` settings row we wrote ourselves earlier (which may have
 *     been written by an older CMS build).
 *
 * Parsing is TOLERANT of extra fields (PM may grow the payload without
 * breaking deployed sites) but STRICT about the essentials: all five purpose
 * keys present, every entry carrying a non-empty string key/label/model and a
 * finite non-negative marginPct. Anything else → null, and the caller keeps
 * serving whatever it had (Contract B: the cache is replaced only by a
 * successful fetch).
 */
import { AI_PURPOSES, type AiConfig, type CuratedModel } from "./types.ts";

/** Refresh the cached config once it is older than this (15 min). */
export const AI_CONFIG_MAX_AGE_MS = 15 * 60 * 1000;

/** The `site_settings.ai_config` row shape: a stamped config. */
export interface AiConfigCache {
  /** epoch ms of the last SUCCESSFUL PM fetch. */
  fetchedAt: number;
  config: AiConfig;
}

/** Is a cache entry stamped `fetchedAt` still within the TTL at `now`? */
export function isAiConfigFresh(fetchedAt: number, now: number): boolean {
  const age = now - fetchedAt;
  return age >= 0 && age < AI_CONFIG_MAX_AGE_MS;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

/** One curated entry, or null when any essential field is missing/mistyped. */
function parseCuratedModel(value: unknown): CuratedModel | null {
  const raw = asRecord(value);
  if (!raw) return null;
  const key = nonEmptyString(raw.key);
  const label = nonEmptyString(raw.label);
  const model = nonEmptyString(raw.model);
  const marginPct = raw.marginPct;
  if (!key || !label || !model) return null;
  if (typeof marginPct !== "number" || !Number.isFinite(marginPct) || marginPct < 0) {
    return null;
  }
  return { key, label, model, marginPct };
}

/**
 * Validate a Contract-A body (or a stored config) into an `AiConfig`.
 * Null when the payload is unusable; a single malformed entry poisons the whole
 * config rather than silently shifting a purpose's default (first entry wins,
 * so dropping one entry would change which model a site runs on).
 */
export function parseAiConfig(json: unknown): AiConfig | null {
  const raw = asRecord(json);
  if (!raw || raw.version !== 1) return null;

  const rawPurposes = asRecord(raw.purposes);
  if (!rawPurposes) return null;

  const purposes = {} as AiConfig["purposes"];
  for (const purpose of AI_PURPOSES) {
    const entry = asRecord(rawPurposes[purpose]);
    if (!entry || !Array.isArray(entry.models)) return null;
    const models: CuratedModel[] = [];
    for (const candidate of entry.models) {
      const parsed = parseCuratedModel(candidate);
      if (!parsed) return null;
      models.push(parsed);
    }
    purposes[purpose] = { models };
  }

  const rawQuota = asRecord(raw.quota);
  if (!rawQuota) return null;
  const monthlyUsd = rawQuota.monthlyUsd;
  if (monthlyUsd !== null && (typeof monthlyUsd !== "number" || !Number.isFinite(monthlyUsd))) {
    return null;
  }

  return { version: 1, purposes, quota: { monthlyUsd } };
}

/** Validate a stored `{ fetchedAt, config }` row; null when unusable. */
export function parseAiConfigCache(json: unknown): AiConfigCache | null {
  const raw = asRecord(json);
  if (!raw || typeof raw.fetchedAt !== "number" || !Number.isFinite(raw.fetchedAt)) {
    return null;
  }
  const config = parseAiConfig(raw.config);
  return config ? { fetchedAt: raw.fetchedAt, config } : null;
}
