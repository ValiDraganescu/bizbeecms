/**
 * Curated AI model config — the PM-owned catalog the CMS fleet consumes
 * (`docs/ai-cost-quotas-contracts.md`, Contract A).
 *
 * PM curates, per PURPOSE, an ordered list of ALIASES. A Site persists the
 * alias `key`; the underlying OpenRouter `model` id and the `label` stay
 * swappable without touching Site data — the alias is the product, the model id
 * an implementation detail. First entry of a list = that purpose's default.
 *
 * Pure and dependency-free (no `@/` alias, no drizzle, no env) so it runs under
 * a bare `node --test`. Persistence lives in ./settings.ts.
 */

export const AI_PURPOSES = [
  "chatAgent",
  "assistant",
  "imageDescribe",
  "imageGenerate",
  "translate",
] as const;

export type AiPurpose = (typeof AI_PURPOSES)[number];

/** One curated alias. `key` is stable and immutable once created. */
export type CuratedModel = {
  /** Stable slug the CMS stores; `[a-z0-9-]{1,40}`, unique within its purpose. */
  key: string;
  /** Customer-facing name; freely renamable. */
  label: string;
  /** OpenRouter model id, e.g. `openai/gpt-4o-mini`. */
  model: string;
  /** Per-alias margin percentage, ≥ 0. */
  marginPct: number;
};

/** Every purpose, always present, each with an ordered (possibly empty) list. */
export type CuratedPurposes = Record<AiPurpose, { models: CuratedModel[] }>;

/** Contract A response body. */
export type AiConfigBody = {
  version: 1;
  purposes: CuratedPurposes;
  quota: { monthlyUsd: number | null };
};

export const AI_CONFIG_VERSION = 1;

const MAX_ALIAS_KEY_LENGTH = 40;
const ALIAS_KEY_RE = /^[a-z0-9-]{1,40}$/;

/** Today's de-facto defaults, seeded on first read (design doc, migration §1). */
export const SEED_CURATED_PURPOSES: CuratedPurposes = {
  chatAgent: { models: [standardEntry("openai/gpt-4o-mini")] },
  assistant: { models: [standardEntry("openai/gpt-4o-mini")] },
  imageDescribe: { models: [standardEntry("openai/gpt-4o-mini")] },
  imageGenerate: { models: [standardEntry("google/gemini-2.5-flash-image")] },
  translate: { models: [standardEntry("openai/gpt-4o-mini")] },
};

function standardEntry(model: string): CuratedModel {
  return { key: "standard", label: "Standard", model, marginPct: 30 };
}

/** An empty catalog: every purpose present, no aliases. */
export function emptyCuratedPurposes(): CuratedPurposes {
  return {
    chatAgent: { models: [] },
    assistant: { models: [] },
    imageDescribe: { models: [] },
    imageGenerate: { models: [] },
    translate: { models: [] },
  };
}

export function isAiPurpose(value: unknown): value is AiPurpose {
  return (AI_PURPOSES as readonly unknown[]).includes(value);
}

/**
 * Derive an alias key from a label: lowercase, non-`[a-z0-9]` runs → single
 * hyphens, trimmed, length-capped. Empty result → `alias`. Deduped against
 * `taken` by appending `-2`, `-3`, … (keys are unique within a purpose and
 * IMMUTABLE afterwards, so this only ever runs at creation time).
 */
export function aliasKeyFromLabel(label: string, taken: readonly string[] = []): string {
  const base =
    label
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, MAX_ALIAS_KEY_LENGTH)
      .replace(/-+$/, "") || "alias";

  const used = new Set(taken);
  if (!used.has(base)) return base;
  for (let n = 2; ; n += 1) {
    const suffix = `-${n}`;
    const candidate = base.slice(0, MAX_ALIAS_KEY_LENGTH - suffix.length) + suffix;
    if (!used.has(candidate)) return candidate;
  }
}

/**
 * Normalize one stored/submitted entry. Returns null when it can't be salvaged
 * (unusable key or empty model) — a corrupt row is dropped, never served.
 */
function normalizeEntry(raw: unknown): CuratedModel | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;

  const key = typeof r.key === "string" ? r.key.trim().toLowerCase() : "";
  const model = typeof r.model === "string" ? r.model.trim() : "";
  if (!ALIAS_KEY_RE.test(key) || !model) return null;

  const label = typeof r.label === "string" && r.label.trim() ? r.label.trim() : key;
  const marginRaw = typeof r.marginPct === "string" ? Number(r.marginPct) : r.marginPct;
  const marginPct =
    typeof marginRaw === "number" && Number.isFinite(marginRaw) && marginRaw >= 0
      ? marginRaw
      : 0;

  return { key, label, model, marginPct };
}

/**
 * Coerce anything (a parsed `app_settings` JSON blob, a request body) into a
 * valid catalog: all five purposes present, entry order preserved, unusable
 * entries and duplicate keys dropped. Never throws — bad input degrades to
 * empty lists rather than taking the fleet's config endpoint down.
 *
 * `dropped` counts the entries that didn't survive, so the two callers can pick
 * their strictness from ONE pass: a READ tolerates dropping (a corrupt row must
 * not break the config endpoint), a WRITE rejects it (an operator who left a
 * model id blank must be told, not silently lose the row).
 */
export function normalizeCuratedPurposes(raw: unknown): {
  purposes: CuratedPurposes;
  dropped: number;
} {
  const source =
    typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : {};
  const purposes = emptyCuratedPurposes();
  let dropped = 0;

  for (const purpose of AI_PURPOSES) {
    const bucket = source[purpose];
    const list =
      typeof bucket === "object" && bucket !== null
        ? (bucket as { models?: unknown }).models
        : undefined;
    if (!Array.isArray(list)) continue;

    const seen = new Set<string>();
    for (const item of list) {
      const entry = normalizeEntry(item);
      if (!entry || seen.has(entry.key)) {
        dropped += 1;
        continue;
      }
      seen.add(entry.key);
      purposes[purpose].models.push(entry);
    }
  }
  return { purposes, dropped };
}

/** Parse the stored `ai_curated_models` JSON string. Absent/corrupt → null. */
export function parseCuratedPurposes(stored: string | null | undefined): CuratedPurposes | null {
  if (typeof stored !== "string" || !stored.trim()) return null;
  try {
    return normalizeCuratedPurposes(JSON.parse(stored)).purposes;
  } catch {
    return null;
  }
}

/**
 * Parse a submitted credit pool. Blank/absent → `null` = UNSET, which means no
 * oversell constraint at all. A non-negative number → that pool. Anything else
 * is `"invalid"` so the write path can reject it instead of silently reading a
 * typo as "no limit" — the difference between the two is a lot of dollars.
 */
export function parsePoolUsd(raw: unknown): number | null | "invalid" {
  const cleaned = typeof raw === "string" ? raw.trim() : raw;
  if (cleaned === "" || cleaned == null) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) && n >= 0 ? n : "invalid";
}

/** Same, for reading storage: a corrupt row degrades to unset, never throws. */
export function readPoolUsd(stored: string | null | undefined): number | null {
  const parsed = parsePoolUsd(stored);
  return parsed === "invalid" ? null : parsed;
}

export type QuotaOversell = {
  /** Sum of every site quota, the candidate change included. */
  totalUsd: number;
  poolUsd: number;
  /** How much the sum exceeds the pool. */
  overUsd: number;
};

/**
 * No-oversell rule (design decision 3): the sum of all site monthly quotas must
 * stay within the configured credit pool. `quotas` are every site's quota with
 * the pending change already applied; null quotas count as 0. A null pool means
 * unconfigured → no constraint. Returns null when fine, else the overshoot.
 */
export function checkQuotasWithinPool(
  quotas: readonly (number | null)[],
  poolUsd: number | null,
): QuotaOversell | null {
  if (poolUsd == null) return null;
  const totalUsd = quotas.reduce<number>((sum, q) => sum + (q ?? 0), 0);
  if (totalUsd <= poolUsd) return null;
  return { totalUsd, poolUsd, overUsd: totalUsd - poolUsd };
}

/** Human-readable 400 message for an oversell rejection. */
export function oversellMessage(o: QuotaOversell): string {
  return `Site quotas total $${o.totalUsd} but the monthly credit pool is $${o.poolUsd} — $${o.overUsd} over. Raise the pool or lower a site quota.`;
}
